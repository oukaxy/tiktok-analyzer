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

  // App IDs and redirect URIs are public (they already appear in the OAuth
  // URL). Secrets stay only in the *-token.js functions.
  // Safe to cache briefly — this rarely changes and contains no secrets.
  // Keep it short so newly added platform env vars show up quickly.
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    clientKey,
    redirectUri,
    instagramAppId: process.env.INSTAGRAM_APP_ID || null,
    instagramRedirectUri: process.env.INSTAGRAM_REDIRECT_URI || null,
    threadsAppId: process.env.THREADS_APP_ID || null,
    threadsRedirectUri: process.env.THREADS_REDIRECT_URI || null,
  });
};
