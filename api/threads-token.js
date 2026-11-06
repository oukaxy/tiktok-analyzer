// Vercel serverless function.
// Exchanges a Threads authorization code for a long-lived Threads user token
// (60 days), or refreshes an existing long-lived token. The app secret lives
// only here, never in the browser.
//
// Set these in Vercel: Project Settings -> Environment Variables
//   THREADS_APP_ID       = Threads App ID (App Dashboard > Threads API)
//   THREADS_APP_SECRET   = Threads App Secret (keep private)
//   THREADS_REDIRECT_URI = https://tiktok-analyzer-sand.vercel.app/callback.html
//
// Docs: https://developers.facebook.com/docs/threads/get-started

const SHORT_LIVED_URL = 'https://graph.threads.net/oauth/access_token';
const LONG_LIVED_URL = 'https://graph.threads.net/access_token';
const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body || {};
}

function errorMessage(data, fallback) {
  return (data && (data.error_message || (data.error && (data.error.message || data.error.type)))) || fallback;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const APP_ID = process.env.THREADS_APP_ID;
  const APP_SECRET = process.env.THREADS_APP_SECRET;
  const REDIRECT_URI = process.env.THREADS_REDIRECT_URI;

  if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
    res.status(500).json({ error: 'Server belum dikonfigurasi (env vars Threads belum diset di Vercel)' });
    return;
  }

  const body = parseBody(req.body);

  try {
    if (body.grant_type === 'refresh' && body.access_token) {
      const url = new URL(REFRESH_URL);
      url.searchParams.set('grant_type', 'th_refresh_token');
      url.searchParams.set('access_token', body.access_token);
      const thRes = await fetch(url);
      const data = await thRes.json();
      if (!thRes.ok || data.error) {
        res.status(thRes.status || 400).json({ error: errorMessage(data, 'Gagal perpanjang sesi Threads') });
        return;
      }
      res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
      return;
    }

    if (!body.code) {
      res.status(400).json({ error: 'Butuh "code" (login pertama) atau "grant_type":"refresh" + "access_token"' });
      return;
    }

    // Step 1: authorization code -> short-lived token (1 hour).
    const form = new URLSearchParams();
    form.set('client_id', APP_ID);
    form.set('client_secret', APP_SECRET);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', REDIRECT_URI);
    form.set('code', body.code);

    const shortRes = await fetch(SHORT_LIVED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const shortData = await shortRes.json();
    const shortToken = Array.isArray(shortData) ? shortData[0] : shortData;

    if (!shortRes.ok || !shortToken || !shortToken.access_token) {
      res.status(shortRes.status || 400).json({ error: errorMessage(shortToken || shortData, 'Gagal tukar kode otorisasi Threads') });
      return;
    }

    // Step 2: short-lived -> long-lived token (60 days).
    const longUrl = new URL(LONG_LIVED_URL);
    longUrl.searchParams.set('grant_type', 'th_exchange_token');
    longUrl.searchParams.set('client_secret', APP_SECRET);
    longUrl.searchParams.set('access_token', shortToken.access_token);

    const longRes = await fetch(longUrl);
    const longData = await longRes.json();

    if (!longRes.ok || longData.error || !longData.access_token) {
      res.status(longRes.status || 400).json({ error: errorMessage(longData, 'Gagal mendapatkan token long-lived Threads') });
      return;
    }

    res.status(200).json({
      access_token: longData.access_token,
      expires_in: longData.expires_in,
      user_id: shortToken.user_id || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungi Threads: ' + err.message });
  }
};
