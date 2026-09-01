// Vercel serverless function.
// Pulls the connected user's videos (with view/like/comment/share counts)
// from TikTok's Display API. The access token comes from the browser
// (it was already handed to the browser by tiktok-token.js at login time),
// so this endpoint just proxies + normalizes the request — no secret needed
// here.
//
// Docs: https://developers.tiktok.com/doc/tiktok-api-v2-video-list/
//
// NOTE — Sandbox mode: this will only return data for TikTok accounts that
// have been added as "Target Users" under your app's Sandbox settings in
// the TikTok for Developers portal (Manage apps -> your app -> Sandbox).
// Any other account will authorize fine but this call will fail with a
// scope/permission error.

const FIELDS = [
  'id',
  'title',
  'video_description',
  'create_time',
  'cover_image_url',
  'share_url',
  'duration',
  'view_count',
  'like_count',
  'comment_count',
  'share_count',
].join(',');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { access_token, cursor } = body;

  if (!access_token) {
    res.status(400).json({ error: 'Butuh "access_token"' });
    return;
  }

  try {
    const tiktokRes = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${FIELDS}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_count: 20,
          ...(cursor ? { cursor } : {}),
        }),
      }
    );

    const data = await tiktokRes.json();

    if (!tiktokRes.ok || (data.error && data.error.code !== 'ok')) {
      const err = data.error || {};
      res.status(tiktokRes.status || 400).json({
        error: err.message || 'Gagal mengambil daftar video dari TikTok',
        code: err.code,
        log_id: err.log_id,
      });
      return;
    }

    res.status(200).json({
      videos: data.data?.videos || [],
      cursor: data.data?.cursor,
      has_more: data.data?.has_more || false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungi TikTok: ' + err.message });
  }
};
