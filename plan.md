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

## Urutan Eksekusi & Verifikasi

1. Fase 1 (fondasi `buildPatternSummary`, Narasi AI, Ide dari Gap)
2. Fase 2 (Repurpose + aiTags — aiTags memperkaya prompt fase berikutnya)
3. Fase 3 → 4 → 5 → 6 → 7.
4. Setiap fase selesai & terverifikasi:
   - Centang `- [x]` item terkait di file ini.
   - Verifikasi standar: ekstraksi `<script>` → `node --check`; uji `callAI` dengan mock; uji manual aplikasi lokal (`python3 -m http.server`) sambil memastikan tidak merusak data lama.
   - (Opsional) commit pesan singkat `feat(faseX): …` bila kamu minta.

## Prinsip yang dipegang (human-in-the-loop)

- AI **menyarankan**, USER yang **memutuskan**: "+ ke Topik", "Isi ke Draft", checkbox planner, Keep/Stop/Iterate — tidak ada penulisan data oleh AI ke log tanpa validasi user.
- Semua penambahan data oleh AI menyimpan asal-usul (`origin`) supaya bisa ditracking & dibedakan dari input manual manusia.
- Data lama (IndexedDB v1) harus tetap bebas berubah tanpa migrasi — migrasi versi DB dilakukan idempotent di `onupgradeneeded`.
