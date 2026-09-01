// Vercel serverless function.
// Serves the TikTok Client Key from an environment variable so it doesn't
// need to be hardcoded in index.html. Note: client_key is NOT a secret —
// it's meant to appear in the browser URL during login — this endpoint is
// purely for convenience (change the key in Vercel without editing code),
// not for security. client_secret is never exposed here or anywhere else
// client-side; that stays only in tiktok-token.js.

module.exports = async (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!clientKey || !redirectUri) {
    res.status(500).json({ error: 'TIKTOK_CLIENT_KEY / TIKTOK_REDIRECT_URI belum diset di Vercel env vars' });
    return;
  }

  // Safe to cache briefly — this rarely changes and contains no secrets.
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ clientKey, redirectUri });
};
