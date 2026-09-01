// Vercel serverless function.
// Exchanges a TikTok OAuth authorization code (or refresh token) for an
// access token. client_secret lives only here, in an environment variable —
// it is NEVER sent to or embedded in the browser.
//
// Set these in Vercel: Project Settings -> Environment Variables
//   TIKTOK_CLIENT_KEY    = (your client key, same one used in the frontend)
//   TIKTOK_CLIENT_SECRET = (your client secret — keep this private)
//   TIKTOK_REDIRECT_URI  = https://tiktok-analyzer-sand.vercel.app/callback.html

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
  const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

  if (!CLIENT_KEY || !CLIENT_SECRET || !REDIRECT_URI) {
    res.status(500).json({ error: 'Server belum dikonfigurasi (env vars TikTok belum diset di Vercel)' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const params = new URLSearchParams();
  params.set('client_key', CLIENT_KEY);
  params.set('client_secret', CLIENT_SECRET);

  if (body.grant_type === 'refresh_token' && body.refresh_token) {
    // Refreshing an existing token
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else if (body.code) {
    // Exchanging a fresh authorization code from the OAuth redirect
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
    params.set('redirect_uri', REDIRECT_URI);
  } else {
    res.status(400).json({ error: 'Butuh "code" (login pertama) atau "refresh_token" (perpanjang sesi)' });
    return;
  }

  try {
    const tiktokRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: params.toString(),
    });

    const data = await tiktokRes.json();

    if (!tiktokRes.ok || data.error) {
      res.status(tiktokRes.status || 400).json({ error: data.error_description || data.error || 'Gagal tukar token' });
      return;
    }

    // Return only what the frontend needs to store locally.
    res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      refresh_expires_in: data.refresh_expires_in,
      open_id: data.open_id,
      scope: data.scope,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungi TikTok: ' + err.message });
  }
};
