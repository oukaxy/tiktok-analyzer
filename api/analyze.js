// Vercel serverless function — proxy AI generik (OpenAI-compatible).
//
// Semua pemanggilan AI dari aplikasi melewati endpoint ini, bukan langsung
// ke provider dari browser. Keuntungan: tidak kena masalah CORS, dan API key
// tidak "tampak" di request ke pihak ketiga (browser hanya bicara dengan
// serverless function milik sendiri).
//
// Request body:
//   baseUrl   — opsional. Base URL provider, mis. https://openrouter.ai/api/v1
//   model     — opsional. Nama model, mis. llama-3.3-70b-versatile
//   apiKey    — opsional. Key dari Pengaturan AI aplikasi.
//   system    — opsional. System prompt.
//   messages  — wajib. Array pesan OpenAI-format [{role, content}].
//   maxTokens — opsional. Default 1024.
//
// API key resolution (urut prioritas):
//   1. body.apiKey          — dari Pengaturan AI aplikasi (localStorage)
//   2. env AI_API_KEY       — opsional, di Vercel/.env
//   3. env GROQ_API_KEY     — backward compatible deployment lama
// Tanpa config sama sekali → default Groq + llama-3.3-70b-versatile.
//
// Guard SSRF: baseUrl wajib https:// dan tidak boleh localhost / IP privat —
// walau endpoint ini private, biar tidak bisa dipakai "menembak" layanan
// internal dari Vercel.

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// SSRF guard — hanya https, tolak localhost / IP loopback / IP privat.
function isUrlAllowed(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local')) return false;
  if (host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') return false;
  // IPv4 literal privat (incl. CGNAT 100.64/10)
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (
      a === 10 || a === 127 || a === 0 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) return false;
  }
  // IPv6 literal — tolak semuanya biar aman (provider publik semuanya IPv4/hostname)
  if (host.includes(':') || host.startsWith('[')) return false;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { messages, system } = body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const baseUrl = (typeof body.baseUrl === 'string' && body.baseUrl.trim())
    ? body.baseUrl.trim().replace(/\/+$/, '')
    : DEFAULT_BASE_URL;
  const model = (typeof body.model === 'string' && body.model.trim())
    ? body.model.trim()
    : DEFAULT_MODEL;

  if (!isUrlAllowed(baseUrl)) {
    return res.status(400).json({ error: 'Base URL tidak diizinkan (wajib https:// dan bukan localhost/IP privat)' });
  }

  const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim())
    ? body.apiKey.trim()
    : process.env.AI_API_KEY || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      error: 'API key belum diatur. Isi di Pengaturan AI aplikasi, atau set AI_API_KEY di Vercel env vars.',
      code: 'NO_API_KEY',
    });
  }

  const maxTokens = Number.isFinite(body.maxTokens) && body.maxTokens > 0
    ? Math.min(Math.round(body.maxTokens), 8192)
    : 1024;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      // Teruskan pesan error provider selengkap mungkin supaya "Uji Koneksi"
      // dan pengguna bisa tahu masalahnya: key salah / model salah / quota.
      let detail = '';
      try {
        const err = await response.json();
        detail = err?.error?.message || err?.message || err?.error || JSON.stringify(err);
      } catch {
        try { detail = await response.text(); } catch { /* noop */ }
      }
      const hint = response.status === 401 || response.status === 403
        ? ' — kemungkinan API key salah.'
        : response.status === 404
          ? ' — kemungkinan base URL atau model salah.'
          : response.status === 429
            ? ' — rate limit provider tercapai, coba lagi nanti.'
            : '';
      return res.status(response.status).json({ error: `Provider error (${response.status}): ${detail}${hint}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ error: 'Gagal menghubungi provider AI: ' + err.message });
  }
}
