// Vercel serverless function.
// Pulls the connected Threads account's profile, posts, and per-post insights.
// The access token comes from the browser, so no app secret is needed here.
//
// Docs:
//   https://developers.facebook.com/docs/threads/get-started
//   https://developers.facebook.com/docs/threads/insights
//
// Permissions: threads_basic (+ threads_manage_insights for all metrics).
// If insights are unavailable, posts still sync and the caller keeps its
// previous values.

const GRAPH = 'https://graph.threads.net/v1.0';
const PROFILE_FIELDS = 'id,username,threads_profile_picture_url,threads_biography';
const POST_FIELDS = 'id,media_product_type,media_type,permalink,username,text,timestamp,shortcode,thumbnail_url';
const INSIGHT_METRICS = ['views,likes,replies,reposts,quotes,shares', 'likes,replies'];

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body || {};
}

async function graphGet(path, params, accessToken) {
  const url = new URL(GRAPH + path);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', accessToken);

  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok || data.error) {
    const err = new Error((data.error && data.error.message) || 'Threads API error');
    err.status = resp.status;
    err.code = data.error && data.error.code;
    throw err;
  }
  return data;
}

function parseInsights(data) {
  const out = {};
  for (const row of (data && data.data) || []) {
    const value = row.values && row.values[0] ? row.values[0].value : (row.total_value && row.total_value.value);
    out[row.name] = value == null ? 0 : value;
  }
  return out;
}

async function fetchPostInsights(postId, accessToken) {
  for (const metric of INSIGHT_METRICS) {
    try {
      return parseInsights(await graphGet(`/${postId}/insights`, { metric }, accessToken));
    } catch {
      // Try the next metric set, then degrade.
    }
  }
  return null;
}

async function fetchFollowers(userId, accessToken) {
  try {
    const data = await graphGet(`/${userId}/threads_insights`, { metric: 'followers_count' }, accessToken);
    const parsed = parseInsights(data);
    return parsed.followers_count == null ? null : parsed.followers_count;
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req.body);
  const { access_token, cursor } = body;

  if (!access_token) {
    res.status(400).json({ error: 'Butuh "access_token"' });
    return;
  }

  try {
    const profile = await graphGet('/me', { fields: PROFILE_FIELDS }, access_token);
    const userId = profile && profile.id;

    if (!userId) {
      res.status(400).json({ error: 'Tidak bisa membaca ID akun Threads dari token' });
      return;
    }

    const postsData = await graphGet('/me/threads', {
      fields: POST_FIELDS,
      limit: 25,
      after: cursor,
    }, access_token);

    const posts = await mapLimit(postsData.data || [], 4, async (post) => ({
      ...post,
      insights: await fetchPostInsights(post.id, access_token),
    }));

    const followers = await fetchFollowers(userId, access_token);

    res.status(200).json({
      profile: { ...profile, followers_count: followers },
      posts,
      next: (postsData.paging && postsData.paging.cursors && postsData.paging.cursors.after) || null,
      has_more: !!(postsData.paging && postsData.paging.next),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || 'Gagal mengambil data dari Threads',
      code: err.code,
    });
  }
};
