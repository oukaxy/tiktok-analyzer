# Plan — Konten Analyzer (Peta Fitur Human / AI / Collaborate)

> Dokumen rencana eksekusi. Checkbox diubah jadi `- [x]` saat fase selesai & terverifikasi.
> Anchor kode memakai **nama fungsi** (bukan nomor baris) karena baris bergeser tiap edit.
> Semua panggilan AI wajib lewat `callAI()` (helper sudah ada) → `/api/analyze` → provider OpenAI-compatible.
> Service Worker `sw.js` tidak perlu di-bump untuk perubahan `index.html` (sudah network-first).

---

## ✅ Fase 0 — AI Provider Configurable — SELESAI

- [x] `api/analyze.js` → proxy generik OpenAI-compatible: terima `{baseUrl, model, apiKey, system, messages, maxTokens}` dari body; fallback key `AI_API_KEY` → `GROQ_API_KEY` (env); default Groq + `llama-3.3-70b-versatile`; guard SSRF (https-only, tolak localhost/IP privat/IPv6 literal); clamp `max_tokens` maks 8192; error provider diteruskan + hint (401/404/429).
- [x] Sheet "Pengaturan AI" (`sheetAI`/`overlayAI`) dibuka dari sheet Akun; preset Groq/OpenRouter/DeepSeek/OpenAI (`AI_PRESETS`); input Base URL, Model, API Key; tombol Simpan + Uji Koneksi; config disimpan `localStorage ka_aiConfig`.
- [x] Helper `callAI({system, messages, maxTokens})` + `stripAiMarkdown()`; semua call site AI difaktorkan ulang (onboarding `genTopics`, `analyzeDraft`, `autoSelectTopic`, `bulkAutoTopic`).
- [x] Bug fix: `c.description` → `c.desc` di `bulkAutoTopic`.
- [x] Verifikasi: 17 test case backend lulus, syntax check frontend OK.

---

## Fase 1 — AI Insight (Narasi AI + Ide dari Gap)

### 1a. Narasi AI (Summarization)
- [x] Tambah tombol "✦ Narasi AI" di `renderInsight()` — letakkan di copy-bar "Tren Performa" (sebelah tombol Copy Insight yang ada) atau di atas `sec-hdr` Pattern. State: default → loading → hasil.
- [x] Fungsi baru `generateNarrative()`:
  - Data (semua sudah ada di scope `renderInsight`): `live[]`, agregasi per hook/struct/topic, retention per hook (logika `buildRetentionInsight`), + output `buildDataWarnings(all, live)`.
  - Faktorkan agregasi `aggBy()` dari `analyzeDraft` menjadi helper global `buildPatternSummary(live)` agar tidak terduplikasi — `analyzeDraft()` memanggil helper yang sama (refactor aman, tidak mengubah perilaku).
  - Kirim `callAI({system, messages, maxTokens: 2048})`. System prompt: "analis konten {platform} niche {niche} — bukan saran generik, sebut angka dari histori."
  - Format output AI: `Kondisi umum → Yang terbukti bekerja (dengan angka) → Signal bahaya → Satu fokus minggu ini (satu tindakan konkret)`.
- [x] Render hasil di `insight-card`; tombol Copy via `copyNarrativeResult()` mengikuti pola `copyInsightResult()` (plain text di `window._narrativeText`).
- [x] Error: tampil di kartu "⚠️ {error}" (pola `analyzeDraft`).
- [x] Verifikasi: tap tombol → narasi muncul; copy → teks bersih; bila `live.length < 3` tombol tidak muncul (ikuti guard yang sudah ada).

### 1b. Ide dari Gap (Ideation)
- [x] Tombol "Ide dari Gap" di `sec-hdr` "Per Topik" (sebelah tombol "✦ Auto Topik Massal" `#bulkTopicBtn`) + container hasil `<div id="gapIdeas">`.
- [x] Fungsi baru `generateGapIdeas()`:
  - Data prompt: skor per topik (avg view/save + jumlah konten, logika sama dengan `buildTable(live,'topic')`) + daftar `cur.topics` + niche + platform + 5 konten terbaik terakhir (judul + topik).
  - Jawab **JSON strict**, maxTokens 2048:
    ```json
    {"underproduced":[{"topic":"…","reason":"…","evidence":"…"}],
     "deprioritize":[{"topic":"…","reason":"…"}],
     "newIdeas":[{"topic":"…","angle":"…","why":"…"}]}
    ```
  - Parse via `stripAiMarkdown()` + `JSON.parse`; gagal parse → toast + pesan di container.
- [x] Render: 3 grup kartu (class `insight-card` / `pat-row` yang sudah ada). Setiap kartu topik punya tombol "+ ke Topik" → `addGapIdeaTopic(topic, btn)`: cek duplikat di `cur.topics`, push, `dbPut('accounts', cur)`, ubah tombol jadi "✓ Ditambahkan".
- [x] Prinsip: AI menyarankan, user yang menambah (human-in-the-loop). Tidak ada penambahan otomatis.
- [x] Verifikasi: JSON ter-parse; tombol tambah bekerja & idempotent (tap 2x tidak membuat duplikat); reload → topik bertahan.

---

## Fase 2 — Repurposing + Klasifikasi Dalam

### 2a. Repurpose
- [x] Tombol "Repurpose" di aksi kartu konten (`renderContentList`, sebaris dengan Edit / Update Performa / Hapus) → `openRepurposeSheet(contentId)`.
- [x] Sheet baru `sheetRepurpose` (pola `sheetPerf`): daftar format valid per platform dari `DRAFT_TABS` + `DRAFT_TAB_LABELS` (opsi yang tidak tersedia untuk platform tidak ditampilkan). Pilih target → tombol "Convert".
- [x] Prompt AI: kirim konten sumber (title, `desc`/`slideScript`, `hook`, `struct`, `topic`, metrik `perf`, `aiTags` jika ada) + aturan target format:
  - `post` (X): maks 280 karakter; `post` (Threads): maks 500; `thread`: 3–7 tweet (open/body/close); `carousel`: 4–8 slide (hook + isi per slide); `video`: hook (0–3s) + body + CTA; `foto`: caption + visual + hashtag.
  - Jawab JSON terstruktur per-field (`{"fields":{...}}` sesuai target), maxTokens 2048.
- [x] Render hasil per-field di sheet. Tombol "Isi ke Draft": `closeSheet('sheetRepurpose')` → `switchView('Draft')` → set tab target (`activeDraftTab`) → isi field form yang relevan (title/hook/slides/body/CTA/caption dst via `document.getElementById`) → toast.
- [x] User memvalidasi sendiri lalu memakai jalur "Simpan ke Log" yang sudah ada. Tidak ada simpan otomatis.
- [x] Tandai asal konten: konten hasil repurpose diberi `origin: 'repurposed:<sourceId>'` (field opsional, aman terhadap logika lama).
- [x] Verifikasi: carousel top → convert ke thread → thread ≥3 tweet, masing-masing <280 karakter; tombol Isi ke Draft mengisi field dengan benar di platform aktif.

### 2b. Klasifikasi Dalam (`aiTags`)
- [x] Tombol "✦ Label Klasifikasi" di Insight (pola `bulkAutoTopic()`: iterasi + `#bulkClassifyStatus` info-box dengan progress).
- [x] Fungsi `bulkClassify()` (sinkron dengan `bulkAutoTopic`): untuk tiap konten live tanpa `aiTags`:
  - Prompt: kirim title + desc/slideScript + hook + struct + metrik — hasil klasifikasi: `{emotion, style, reason}`; `emotion` ∈ {Edukasi, Drama, Percobaan, Reaksi, Humor, Daftar/Tips, …}; `style` gaya bahasa (informal/formal/humor/provokatif dsb).
  - Jawab JSON strict `{"emotion":"","style":"","reason":"<1 kalimat>"}`, maxTokens 512; per konten → `dbPut('contents', c)`; skip bila gagal (pola bulkAutoTopic).
- [x] Agregasi baru di Insight: "Per Emosi Hook" + "Per Gaya Bahasa" — perlu helper kecil `aggregateByPath(live,'aiTags.emotion')` karena field nested (gaya `buildTable`).
- [x] Sisipkan `aiTags.reason` ke prompt F1 & `analyzeDraft` (baris `history.map(...)` → tambah `| Tags:${c.aiTags?.emotion||'—'}/${c.aiTags?.style||'—'}`).
- [x] Verifikasi: proses massal 5 konten → 5 konten punya `aiTags`; tabel baru muncul; reload → tetap.

---

## Fase 3 — Profil Akun (Audience + Brand Positioning)

### 3a. Penyimpanan & UI
- [x] `account.positioning = {tone:'', audience:'', pillars:[]}` — edit di sheet Pengaturan:
  - Section baru di atas chip di `renderSettings()` + pembacaan field di `saveSettings()` (`editTone`, `editAudience`, `editPillars` — pola chip `editChips`).
- [x] Aktifkan store `audience` (sudah ada di `initDB` + index `accountId`; sudah ikut export/import & cascade delete di `deleteAccount`).
  - Persona: `{id, accountId, name, ageRange:'', painPoints:[], favoriteWords:'', notes:''}` — CRUD sederhana.
- [x] UI persona: section "Persona Audiens" di sheet Pengaturan: list kecil + "+ Tambah Persona" (inline edit — pola sheet Add; maks 3 persona agar prompt hemat token).
- [x] Kicker Insight: bila `positioning.audience` kosong DAN tidak ada persona → kartu info "Isi persona → AI lebih akurat" dengan tombol menuju Pengaturan (pola `info-box`).
- [x] Verifikasi: simpan positioning → tampilan diperbarui; persona save/reload → data tetap; export → data ikut; hapus akun → persona ikut terhapus.

### 3b. Integrasi ke prompt AI
- [x] Helper `buildContextBlock(cur)` yang mengembalikan string `\nPosisi brand: {tone|—}\nTarget audiens: {audience|—}\nPersona: {name} ({ageRange}) — pain: {painPoints.join('; ')}` (maks. 1 persona pertama).
- [x] Inject ke: `analyzeDraft` (dalam const `base=`), `generateNarrative`, `generateGapIdeas`, `autoSelectTopic`.
- [x] Verifikasi: dengan persona terisi, "Analisis" di draft menyinggung bahasa yang sesuai persona (manual spot-test bila ada 3+ konten live).

---

## Fase 4 — Weekly Review + A/B Eksperimen

### 4a. Review Mingguan (ritual Keep / Stop / Iterate)
- [x] Tombol "Review Mingguan" di viewInsight (area pattern) → sheet `sheetReview` dua-step (pola step-bar sheet Add):
  - Step 1: statistik 7 hari terakhir — data 7d vs 7d sebelumnya, tanpa AI dulu.
  - Step 2: daftar pola dari `buildPatterns(live7)` + chip keputusan `Keep / Stop / Iterate` per pola.
  - Simpan: `account.reviews[] = {date, kept:[], stopped:[], iterate:[]}` (`dbPut('accounts', cur)`).
- [x] Konteks: 1 review terakhir disisipkan di system prompt F1 ("Keputusan review lalu: keep=…, stop=…, iterate=…") supaya minggu depan AI mengingat keputusan strategi.
- [x] Verifikasi: review tersimpan & reload tetap; review minggu berikutnya menampilkan keputusan terakhir di step-1.

### 4b. A/B Eksperimen
- [x] Tombol "A/B" di kartu konten (`renderContentList` — untuk konten LIVE): `openABSheet(contentId)`; pilih 1 konten pembanding (dropdown berisi konten live lain, urut topik sama lebih dulu) + label metric tujuan (Save / View).
- [x] Data: **tanpa store baru**. `content.experiment = {id, group:'A'|'B'}` — `id` = `Date.now().toString(36)` sama untuk pasangan.
- [x] Tampil di Compare (section baru "Eksperimen A/B"): daftar pasangan + verdict lokal (bukan AI) — winner per metrik yang dipilih.
- [x] Tombol "Minta penjelasan AI" per pasangan → `callAI` jelaskan mengapa menang (kirim hook/struct/topic/aiTags/metrik kedua konten) → hasil tetap di kartu, bisa di-copy.
- [x] Verifikasi: 2 konten dipasangkan → muncul di Compare → verdict terlihat; unpair → hapus `.experiment` (kembali tanpa pasangan).

---

## Fase 5 — Kompetitor + Bobot Prioritas Ide

### 5a. Analisis Kompetitor
- [x] **Schema DB**: versi `initDB` 1 → 2. Tambah store `competitors`: `createObjectStore('competitors',{keyPath:'id'})` + index `accountId` di `onupgradeneeded` (pola idempotent `contains()` yang sudah ada). Tab lama cukup direfresh.
  - Record: `{id, accountId, name, url?, snippets:[{title, desc, view?}], summary:{positioning, hooksPatterns:[], contentGaps:[]}, createdAt}`.
  - Patch `exportData`/`importData`: ikutkan `competitors` (pola sama dengan audit store).
- [x] UI: tombol "Analisis Kompetitor" di sheet Akun (di bawah Pengaturan AI) → sheet `sheetCompetitor`:
  - Form: nama kompetitor + daftar snippet manual (input judul + deskripsi temuan) — **paste manual saja, tidak scraping**.
  - Tombol "Simpan & Analisis" → `callAI` JSON strict `{"positioning":"","hooksPatterns":[],"contentGaps":[]}`, maxTokens 1024 → simpan record `competitors`.
- [x] Tombol "Bandingkan dengan Akunku" per kompetitor: prompt gabungan (`competitor.summary` + snapshot akun `buildPatternSummary`) → kartu "Peluang & Gap" (JSON `{"opportunities":[…]}`), tiap kartu topik punya "+ ke Topik" (logika F2).
- [x] Verifikasi: dari DB v1 → buka versi 2 aman, data tidak hilang; simpan 1 kompetitor + re-analisis; export → competitors ikut.

### 5b. Bobot Prioritas Ide
- [x] Chip bobot tujuan di atas grup kartu ide (F2 / 5a): **Jualan / Awareness / Save** — satu chip aktif; disimpan `account.prWeights` (default seimbang).
- [x] Skor dihitung lokal tanpa AI: `score = (avgSave/maxAvgSave)*w.save + (avgViewRatio)*w.view + (gapScore)*w.jualan` — sort desc + bar horizontal inline di kartu.
- [x] Verifikasi: ganti bobot → urutan kartu berubah sesuai; nilai stabil antar reload.

---

## Fase 6 — Reporting + Calendar Planner AI

### 6a. Laporan Bulanan
- [x] Tombol "Export Laporan" di Insight (sebelah "✦ Narasi AI"): filter konten bulan berjalan.
- [x] Kumpul: statistik inti (total konten, avg view/save, best format), tabel per hook/struct/topic, ringkasan `reviews[]` dan pasangan A/B di bulan tersebut → AI narasi gaya "laporan bisnis singkat" (maxTokens 2048).
- [x] Output: preview sheet kecil + tombol:
  - "Download .md" — Blob download (pola `exportData`), nama `laporan-{bulan}-akun.md`.
  - "Copy" — clipboard via pola `copyInsightResult`.
- [x] Verifikasi: file .md valid & penuh; metrik tidak tercampur antar akun.

### 6b. Calendar Planner AI
- [x] Tombol "Rencanakan Minggu" di viewCalendar (header): default minggu berikutnya (bisa diganti).
- [x] Prompt AI: topik queue (`cur.topics` + skor gap F2 bila ada) + ritme historis (berapa post/minggu dari `contents` 4 minggu terakhir) + format akun → JSON strict `{"suggestions":[{"date":"YYYY-MM-DD","topic":"","format":"","hook":"?"}]}`.
- [x] Sheet "Rencana Mingguan" daftar usulan + checkbox per baris (default semua checked). "Tambahkan yang Dicentang" → `dbPut('contents', {…, perf:null, date})` per item (masuk kalender sebagai draft) + toast jumlah.
- [x] Verifikasi: bentak minggu lintas bulan/tahun benar; tidak ada dobel di tanggal sama kecuali memang ritmenya >1 post/hari; item bisa diedit/hapus manual setelah dibuat.

---

## Fase 7 — Perbaikan Kecil & Konsistensi

- [x] **Pengaturan platform**: `<select id="editPlatform">` di `renderSettings()` hanya TikTok/Instagram/YouTube → tambah **X** dan **Threads** (samakan daftar dengan platform-grid onboarding). `FMT`, `GOALS`, dll. sudah mendukung X/Threads.
- [x] **Lokalisasi tanggal**: potongan tanggal raw (`c.date` pada area compare/hasil draft) → `toLocaleDateString('id-ID', {day:'numeric', month:'short'})` (pola `buildLineChart`).
- [x] **Sanity prompt**: pastikan semua prompt JSON strict jelas minta "hanya JSON tanpa markdown" di system prompt; `maxTokens` eksplisit saat kebutuhan > default (2048 untuk F1/F2/repurpose/review/laporan; 512 untuk klasifikasi; 1024 default).
- [x] Verifikasi: `node --check` ekstraksi `<script>`; uji manual ringkas per perubahan.

---

## Fase 8 — Pilar Konten Aktif — SELESAI

> Sebelumnya `positioning.pillars` hanya tersimpan di Pengaturan tanpa dipakai siapa pun.

### 8a. Pilar masuk konteks AI
- [x] `buildContextBlock()` menambahkan baris `Pilar konten: p1; p2; p3` bila ada → otomatis ikut ke prompt `analyzeDraft`, `generateNarrative`, `generateGapIdeas`, `autoSelectTopic` (semua sudah inject contextBlock).
- [x] Tombol "✦ Saran Pilar" di sheet Pengaturan (pola tombol Auto Topik) → `suggestPillars()`: AI usulkan 3–5 pilar dari niche/platform/topik, hasil tampil sebagai chip `+ tap untuk tambah` → `addSuggestedPillar()` (dedup case-insensitive, langsung `dbPut`, human-in-the-loop).

### 8b. Konten punya pilar + analitiknya
- [x] Field opsional `content.pillar` (string, default `'—'`) — tanpa migrasi DB.
- [x] Sheet Add/Edit: chip-group `inPillarChips` dari `cur.positioning.pillars` (`mkChips` di `renderAddChips`, `selByText` di `openEditSheet`, dibaca `buildContent()` sebagai `cs['inPillar']`).
- [x] "✦ Label Pilar Massal" di Insight → `bulkLabelPillar()` (pola `bulkAutoTopic`): konten live tanpa pilar diklasifikasi AI ke SATU pilar dari daftar akun (jawaban divalidasi ke daftar, ditolak bila di luar), progress info-box.
- [x] Section "Per Pilar" di Insight (setelah Per Topik): `buildTable(live.filter(pillar),'pillar')` — tampil hanya bila ada konten berpilar; kosong → info-box pengarah.

### 8c. Pilar dalam perencanaan
- [x] Prompt "Rencanakan Minggu": daftar pilar + distribusi konten live per pilar + aturan 5 (sebar merata antar pilar, pilar terlemah dapat porsi lebih besar; field `pillar` wajib di suggestions — hanya saat akun punya pilar). Usulan menampilkan pilar di meta & `addPlannedContents()` menyimpan `pillar`.
- [x] Prompt Ide dari Gap: instruksi `newIdeas` selaras dengan pilar (bila ada) — konteks pilar sendiri sudah masuk via contextBlock 8a.

- [x] Verifikasi: ekstraksi `<script>` → `node --check` OK; uji headless `buildContextBlock` (pilar masuk, aman bila kosong), `buildTable` per pilar (urut avg save), filter bulk (hanya konten tanpa pilar). Catatan: panggilan AI live & tap-test UI tidak diuji (tanpa API key; WebView debugging nonaktif di build ini).

---

## Fase 9 — Sync Instagram + Threads (Meta API)

> Fokus **Instagram dulu, metrik lengkap**; Threads menyusul setelah IG stabil.
> Pola mengikuti sync TikTok (`ttConnectAccount` → `callback.html` → `api/*-token.js` → `api/*-sync.js` → upsert `contents`), tapi token Meta **per akun aplikasi** dan tanpa `refresh_token` (long-lived 60 hari).
> **Meta Business account bukan syarat akses API** — yang wajib: Meta Developer App + produk Instagram/Threads + akun IG Professional terdaftar sebagai tester (tanpa App Review untuk akun sendiri).
>
> **Status:** kode 9b–9e sudah dibuat & lolos `node --check`, uji logika mapping/upsert, uji token refresh (7 hari), dan uji handler API dengan fetch tiruan (profil, media, insights + fallback metrik, paginasi). Belum diuji ke API Meta asli (menunggu env Vercel + app Meta); checkbox tetap terbuka sampai uji live.

### 9a. Prasyarat manual & cek awal
- [ ] Buat Meta App tipe Business; tambah produk **Instagram API with Instagram Login** → catat *Instagram App ID* + *App Secret*.
- [ ] Daftarkan redirect URI `https://tiktok-analyzer-sand.vercel.app/callback.html`; daftarkan akun IG Professional sebagai tester lalu terima undangan di app Instagram.
- [ ] Set env Vercel: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`.
- [ ] **Uji lebih dulu**: apakah OAuth Meta bisa dibuka dari WebView/Guest Browser yang dipakai sekarang. Bila ditolak, rencana butuh browser eksternal + deep link (belum termasuk fase ini).
- [ ] Nanti untuk Threads: produk **Threads API**, `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI`, redirect URI sama, akun Threads sebagai tester.

### 9b. Backend Instagram
- [ ] `api/config.js`: tambah field publik `instagramAppId`, `instagramRedirectUri` (dan `threadsAppId`, `threadsRedirectUri` nanti). Secret tidak pernah ikut.
- [ ] `api/instagram-token.js` (baru): `POST {code}` → `POST https://api.instagram.com/oauth/access_token` (form) lalu `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token` → long-lived 60 hari; `POST {grant_type:'refresh', access_token}` → `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`. Secret hanya dari env server.
- [ ] `api/instagram-sync.js` (baru): `POST {access_token, cursor?}`.
  - Profil: `GET /me?fields=user_id,username,account_type,followers_count,follows_count,media_count`.
  - Media: `GET /{ig_user_id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,view_count&limit=25`.
  - Insight per media **hanya halaman pertama**: `metric=saved,shares,views,reach` → fallback `saved,shares` → `null` bila gagal; concurrency 4; jangan gagalkan seluruh sync karena satu media.
  - Return `{profile, media, next, has_more}`; error Meta diteruskan (message + code).
  - Batas 4 halaman (100 post) per sync — beri komentar `shortcut:` di kode.
- [ ] `vercel.json`: `"functions": {"api/instagram-sync.js": {"maxDuration": 60}}` (nanti threads).
- [ ] `callback.html`: dukung state prefix `ig:`; verifikasi terhadap `ka_oauth_state`; panggil `/api/instagram-token`; simpan `ka_syncToken_<akunAktif>`; redirect. Jalur TikTok (`tt_oauth_state`, `tt_oauth_token`) tidak diubah.

### 9c. Frontend Instagram (`index.html`)
- [ ] Token per akun: `ka_syncToken_<accId>` = `{provider, access_token, obtained_at, expires_in, userId, username, lastSyncAt}`. Token TikTok lama dibiarkan apa adanya.
- [ ] `igConnectAccount()`: redirect ke `https://www.instagram.com/oauth/authorize?client_id=…&scope=instagram_business_basic,instagram_business_manage_insights&response_type=code&state=ig:…`.
- [ ] `igEnsureFreshToken()`: refresh bila sisa < 7 hari; gagal → putuskan token + minta reconnect di banner.
- [ ] `igSync()`: profil → `cur.stats = {follower, following, likes:0, posts:media_count, updatedAt}`; media → mapping → `upsertSyncedContents`.
- [ ] Helper `upsertSyncedContents(items, keyField)`: adaptasi logika `ttSyncVideos` (cocok exact by key, fuzzy `ttSimilarity` ≥ 0.85 untuk draft tanpa key, buat baru bila tidak ada). Field manual (`format/hook/struct/topic/goal/notes/retention`) tidak ditimpa; `save/share` lama dipertahankan bila insight `null`.
- [ ] Mapping format: `media_product_type==='REELS'` → `Reels`; `CAROUSEL_ALBUM` → `Carousel`; `VIDEO` → `Video`; `IMAGE` → `Foto`. Judul = baris pertama caption (maks 120), fallback `(Tanpa judul)`; `shareUrl = permalink`; `date` dari `timestamp`.
- [ ] `perf`: `view = insights.views ?? view_count ?? 0`, `like = like_count`, `comment = comments_count`, `save = insights.saved ?? 0`, `share = insights.shares ?? 0`, `follower = 0`.
- [ ] Banner koneksi dipakai ulang untuk TikTok/Instagram/Threads (judul, sub, tombol Sync, disconnect per platform); banner import CSV tetap khusus TikTok.
- [ ] `ttMaybeAutoSync` digeneralisasi: auto-sync 30 menit untuk akun IG yang punya token.
- [ ] `editSync` menyimpan `igId`/`thId` (dan `lastSyncAt`) agar tidak hilang saat `saveContentFull`.
- [ ] `deleteAccount` ikut `localStorage.removeItem('ka_syncToken_'+cur.id)`.
- [ ] Kartu profil di `renderSettings`: sel ke-3 jadi "Postingan" (`stats.posts`) untuk IG/Threads; "Total Suka" tetap untuk TikTok.

### 9d. Backend Threads (setelah IG stabil)
- [ ] `api/threads-token.js` (baru): authorize `https://threads.net/oauth/authorize`; tukar `POST https://graph.threads.net/oauth/access_token`; perpanjang `GET …/access_token?grant_type=th_exchange_token`; refresh `GET …/refresh_access_token?grant_type=th_refresh_token`.
- [ ] `api/threads-sync.js` (baru): `GET /me?fields=id,username,threads_profile_picture_url,threads_biography`; `GET /me/threads?fields=id,media_product_type,media_type,permalink,username,text,timestamp,shortcode,thumbnail_url&limit=25`; insight per post `GET /{id}/insights?metric=views,likes,replies,reposts,quotes,shares`; follower `GET /{user-id}/threads_insights?metric=followers_count`. Concurrency 4, batas halaman sama.
- [ ] `vercel.json`: `maxDuration: 60` untuk `api/threads-sync.js`.

### 9e. Frontend Threads (`index.html`)
- [ ] `thConnectAccount()` scope `threads_basic,threads_manage_insights`; token per akun dengan `provider:'threads'`; refresh analog IG.
- [ ] `thSync()`: profil → `cur.stats = {follower, following:0, likes:0, posts:0, updatedAt}`; post → `upsertSyncedContents` key `thId`.
- [ ] Mapping: `TEXT_POST` → `Post`, `IMAGE` → `Foto`, `VIDEO` → `Video`, `CAROUSEL_ALBUM` → `Post`; judul = baris pertama `text` (maks 120), `shareUrl = permalink`.
- [ ] `perf`: `view = insights.views`, `like = insights.likes`, `comment = insights.replies`, `share = insights.reposts + insights.quotes`, `save = 0`, `follower = 0`.

### 9f. Verifikasi
- [ ] `node --check` semua `api/*.js`; ekstraksi inline `<script>` dari `index.html` → `node --check`.
- [ ] Uji token + `/me` + media via Graph API Explorer/curl sebelum wiring frontend.
- [ ] Connect → Sync → cek jumlah konten, format, tanggal, `shareUrl`; sync kedua tidak membuat duplikat.
- [ ] Edit konten hasil sync → `igId`/`thId` tetap; reload → data tetap.
- [ ] Disconnect/reconnect; token kedaluwarsa → refresh; izin kurang → pesan error jelas (bukan crash).
- [ ] Export/import tidak membawa token.

### 9g. Ceiling / risiko
- Meta tidak memberi `refresh_token`; refresh hanya bisa setelah token berumur 24 jam. Bila token benar-benar kedaluwarsa → user harus reconnect.
- Insight per-post = N panggilan; hanya halaman pertama yang di-insight → `save/share` post lama bisa 0. Upgrade: job background / tombol refresh insight bila diperlukan.
- Token di localStorage (pola sama dengan TikTok), scope read-only (tanpa publish). Risiko XSS tetap sama seperti token TikTok sekarang.
- Tanpa App Review hanya akun tester yang bisa sync; Advanced Access + verifikasi bisnis dibutuhkan bila nanti dipakai user lain.
- OAuth Meta bisa menolak embedded WebView — **cek 9a dulu** sebelum membangun seluruh fase.

---

## Fase 10 — Klasifikasi Funnel (TOFU/MOFU/BOFU) — SELESAI

> Menyalin pola Fase 8 (pilar) untuk tahap funnel. Enum tetap 3 nilai — tanpa pengaturan, tanpa migrasi DB.

### 10a. Konten & draft punya funnel
- [x] Field opsional `content.funnel` ('TOFU'/'MOFU'/'BOFU', default `'—'`).
- [x] Sheet Add/Edit: chip-group `inFunnelChips` tetap (TOFU/MOFU/BOFU) setelah Pilar Konten (`mkChips` di `renderAddChips`, `selByText` di `openEditSheet`, dibaca `buildContent()` sebagai `cs['inFunnel']`). Semua draft yang disimpan ke Log otomatis punya funnel.

### 10b. Funnel dalam perencanaan & konteks AI
- [x] Prompt "Rencanakan Minggu": distribusi funnel konten live + definisi singkat TOFU/MOFU/BOFU + aturan wajib isi `"funnel"` per usulan, sebar seimbang (funnel terlemah dulu). Usulan menampilkan funnel di meta; `addPlannedContents()` menyimpan `funnel` (divalidasi ke 3 nilai, upper-case).
- [x] `buildContextBlock()`: baris `Distribusi funnel konten live: TOFU (n), …` bila ada konten live → semua prompt yang inject contextBlock sadar mix funnel akun.

### 10c. Analitik funnel
- [x] Section "Per Funnel" di Insight (setelah Per Pilar): `buildTable(live,'funnel')` — selalu tampil, termasuk bucket `'—'` supaya terlihat berapa konten yang belum berlabel; per baris: jumlah konten + avg view/save.
- [x] "✦ Label Funnel Massal" → `bulkLabelFunnel()` (pola `bulkLabelPillar`, lebih simpel — daftar tetap): konten live tanpa funnel diklasifikasi AI ke SATU nilai TOFU/MOFU/BOFU (validasi ke daftar, ditolak bila di luar), progress info-box.

- [x] Verifikasi: ekstraksi `<script>` → `node --check` OK; uji headless `buildTable` per funnel (bucket `'—'` tampil, urut avg save), filter bulk (hanya konten live tanpa funnel), validasi nilai planner. Catatan: panggilan AI live & tap-test UI tidak diuji (tanpa API key).

---

## Fase 11 — Mekanisme "Tujuan Tercapai" — SELESAI

> Sebelumnya satu-satunya evaluasi tujuan hardcoded ke goal "Save tinggi" saja (`buildPatterns`). Sekarang: verdict per konten + rekap semua tujuan, dengan dua batas keberhasilan.

### 11a. Batas "tercapai" — dua lapis, tanpa input wajib
- [x] **Relatif** (default): tujuan dipetakan ke metrik `perf` via `goalMetric(g)` (save→save, like/engag→like, jangkau/reach/view→view, follower→follower, fallback save). Tercapai bila nilai konten ≥ rata-rata akun untuk metrik itu (dihitung ulang saat render, ikut tumbuh saat akun berkembang).
- [x] **Absolut** (opsional): field `content.target` + `content.actual` (number, null bila kosong) untuk tujuan terukur manual — mis. "Penjualan" target 300, aktual diisi belakangan saat hasil masuk. Sinkron dengan funnel: konten BOFU = kandidat paling wajar diberi target.

### 11b. Verdict per konten (Log)
- [x] Helper murni `goalVerdict(c, metricAvg)` + `goalBadge(c, metricAvg)`: target+aktual → hijau ✓ / merah ✗ "120/300 (40%)"; target saja → amber "menunggu hasil"; tanpa target (ada performa) → ✓/✗ relatif "5 ≥ avg"; tanpa goal/performa → badge polos seperti dulu.
- [x] `applyFilter()` menghitung `metricAvg` per metrik dari konten live; badge tujuan di kartu Log kini render via `goalBadge` (CSS baru `.b-green`/`.b-red` memakai var yang sudah ada).

### 11c. Rekap "Tujuan vs Realita" (Insight)
- [x] `buildPatterns()` — blok hardcoded "Save tinggi" diganti loop semua tujuan yang muncul di konten live: konten bertarget dijumlah absolut (`total aktual/total target` + % + jumlah yang menunggu hasil), sisanya relatif (`rata2 vs akun` + `n/N tercapai`).

### 11d. Form
- [x] Sheet Add/Edit: pasangan input number "Target Angka & Hasil (opsional)" di bawah Tujuan Konten; reset di `openAddSheet`, prefill di `openEditSheet`, disimpan `buildContent()`.
- [x] Batasan: satu tujuan + satu pasang target/aktual per konten — konversi kedua dicatat di catatan pribadi.

- [x] Verifikasi: ekstraksi `<script>` → `node --check` OK; uji headless `goalMetric` (5 mapping), `goalVerdict` (absolut ok/bad/wait, relatif ok/bad, tanpa goal/data), `goalBadge` (kelas warna), agregat absolut & relatif untuk kartu Insight. Catatan: tap-test UI tidak diuji (WebView debugging nonaktif di build ini).

---

## Urutan Eksekusi & Verifikasi

1. Fase 1 (fondasi `buildPatternSummary`, Narasi AI, Ide dari Gap)
2. Fase 2 (Repurpose + aiTags — aiTags memperkaya prompt fase berikutnya)
3. Fase 3 → 4 → 5 → 6 → 7.
4. Fase 9 — cek 9a dulu (WebView + app Meta), lalu 9b → 9c (Instagram), baru 9d → 9e (Threads).
5. Setiap fase selesai & terverifikasi:
   - Centang `- [x]` item terkait di file ini.
   - Verifikasi standar: ekstraksi `<script>` → `node --check`; uji `callAI` dengan mock; uji manual aplikasi lokal (`python3 -m http.server`) sambil memastikan tidak merusak data lama.
   - (Opsional) commit pesan singkat `feat(faseX): …` bila kamu minta.

## Prinsip yang dipegang (human-in-the-loop)

- AI **menyarankan**, USER yang **memutuskan**: "+ ke Topik", "Isi ke Draft", checkbox planner, Keep/Stop/Iterate — tidak ada penulisan data oleh AI ke log tanpa validasi user.
- Semua penambahan data oleh AI menyimpan asal-usul (`origin`) supaya bisa ditracking & dibedakan dari input manual manusia.
- Data lama (IndexedDB v1) harus tetap bebas berubah tanpa migrasi — migrasi versi DB dilakukan idempotent di `onupgradeneeded`.

---

## Backlog — Nice to Have (draft ide, belum dieksekusi)

> Ide tersimpan agar tidak hilang. Tidak ada komitmen waktu; kerjakan bila kebutuhan muncul.

### B1 — Auto-Posting (publish/schedule via API)
- [ ] Urutan realistis: **Threads teks** (MVP, caption draft → publish langsung, tanpa hosting file) → **Instagram Reels** (akun Business + Meta review + video di URL publik: container → poll FINISHED → `media_publish`) → **TikTok direct post** (`video.publish`, wajib audit TikTok — sandbox tidak cukup; paling berat).
- [ ] Arsitektur: fungsi `api/` baru per platform (token + publish, pola `tiktok-token.js`/`tiktok-videos.js`); OAuth reuse pola `callback.html`; scheduler = cron eksternal/Vercel memanggil endpoint publish dengan shared secret; guard idempotensi agar retry tidak dobel-post.
- [ ] Bloker utama: app hanya menyimpan **metadata** konten, bukan file video → butuh form upload + blob storage (Vercel Blob/Cloudinary) sebelum auto-post video mungkin. Tanpa itu, hanya konten teks (Threads/X) yang layak di-MVP.
- [ ] Tutup loop planner: item kalender → terbit otomatis di jam H → sync menarik performanya.

### B2 — Balas Komentar berkonteks
- [ ] Diferensiator vs harness generik (n8n/Zapier): app punya konteks per-post (hook/topik/pilar/persona/tone/verdict A/B) — balasan AI selaras dengan konten yang dikomentari, bukan balasan generik.
- [ ] **MVP tanpa API baru** (jalan hari ini, semua platform termasuk TikTok): sheet "Balas Komentar (paste manual)" — paste teks komentar + pilih post dari log → AI drafting balasan pakai `buildContextBlock()` + data post → copy manual ke platform.
- [ ] **Model B — inbox in-app**: Instagram (`instagram_manage_comments`: GET `/{media}/comments` + POST reply) & Threads (`threads_manage_replies`) via `api/` baru (poll, atau webhook Meta); **TikTok terblokir** Comments Management API sampai app lolos audit.
- [ ] **Model A — n8n sebagai tangan**: saat sync, app push "context bundle" per post-id ke endpoint Vercel (secret key) → n8n menarik konteks itu saat membalas. Untuk full-auto; default tetap approve-first sesuai prinsip di atas.
- [ ] Prasyarat Model B/A: akun Instagram Business/Creator (belum dikonfirmasi) + Meta App Review untuk permission komentar.
