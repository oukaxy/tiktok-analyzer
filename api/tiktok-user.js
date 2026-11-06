// Vercel serverless function.
// Fetches the connected user's profile stats (followers / following / total
// likes) from TikTok's Display API. The access token comes from the browser,
// same pattern as tiktok-videos.js — no secret needed here.
//
// Docs: https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/
//
// Only needs user.info.stats (already requested by the app). Sandbox mode:
// this only returns data for accounts added as "Target Users".

const FIELDS = [
  'open_id',
  'follower_count',
  'following_count',
  'likes_count',
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

  const { access_token } = body;

  if (!access_token) {
    res.status(400).json({ error: 'Butuh "access_token"' });
    return;
  }

  try {
    const tiktokRes = await fetch(
      `https://open.tiktokapis.com/v2/user/info/?fields=${FIELDS}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${access_token}` },
      }
    );

    const data = await tiktokRes.json();

    if (!tiktokRes.ok || (data.error && data.error.code !== 'ok')) {
      const err = data.error || {};
      res.status(tiktokRes.status || 400).json({
        error: err.message || 'Gagal mengambil profil dari TikTok',
        code: err.code,
        log_id: err.log_id,
      });
      return;
    }

    res.status(200).json({ user: data.data?.user || {} });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungi TikTok: ' + err.message });
  }
};
