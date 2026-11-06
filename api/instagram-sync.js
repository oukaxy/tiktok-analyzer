// Vercel serverless function.
// Pulls the connected Instagram professional account's profile + media, and
// (for the first page only) per-media insights. The access token comes from
// the browser, so no app secret is needed here.
//
// Docs:
//   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
//   https://developers.facebook.com/docs/instagram-platform/insights
//
// Permissions: instagram_business_basic (+ instagram_business_manage_insights
// for saved/shares/views). If insights are not available, media still syncs
// with like/comment/view counts and the caller keeps its previous values.

const GRAPH = 'https://graph.instagram.com/v26.0';
const PROFILE_FIELDS = 'user_id,username,account_type,profile_picture_url,followers_count,follows_count,media_count';
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,view_count';
const INSIGHT_METRICS = ['saved,shares,views,reach', 'saved,shares'];

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
    const err = new Error((data.error && data.error.message) || 'Instagram API error');
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

async function fetchInsights(mediaId, accessToken) {
  for (const metric of INSIGHT_METRICS) {
    try {
      return parseInsights(await graphGet(`/${mediaId}/insights`, { metric }, accessToken));
    } catch {
      // Try the next metric set, then degrade to basic media fields.
    }
  }
  return null;
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
    const profileData = await graphGet('/me', { fields: PROFILE_FIELDS }, access_token);
    const profile = Array.isArray(profileData.data) ? profileData.data[0] : profileData;
    const igUserId = profile && (profile.user_id || profile.id);

    if (!igUserId) {
      res.status(400).json({ error: 'Tidak bisa membaca ID akun Instagram dari token' });
      return;
    }

    const mediaData = await graphGet(`/${igUserId}/media`, {
      fields: MEDIA_FIELDS,
      limit: 25,
      after: cursor,
    }, access_token);

    let media = mediaData.data || [];
    // Insights are per-media calls (1-2 requests each), so only enrich the
    // first page. Older pages still import caption/date/like/comment/view.
    if (!cursor && media.length) {
      media = await mapLimit(media, 4, async (item) => ({
        ...item,
        insights: await fetchInsights(item.id, access_token),
      }));
    }

    res.status(200).json({
      profile,
      media,
      next: (mediaData.paging && mediaData.paging.cursors && mediaData.paging.cursors.after) || null,
      has_more: !!(mediaData.paging && mediaData.paging.next),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || 'Gagal mengambil data dari Instagram',
      code: err.code,
    });
  }
};
