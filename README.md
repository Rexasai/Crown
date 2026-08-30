# CROWN PS STORE — versi Server/Database + Admin Panel

Ini versi upgrade dari prototype awal (yang datanya cuma tersimpan di
localStorage HP). Sekarang semua data (akun, saldo, ticket, pembayaran,
inventory, dll) **tersimpan di server**, jadi:
- Bisa diakses dari HP/PC mana saja, bukan cuma 1 device.
- Beberapa admin bisa kelola bareng dari tempat berbeda.
- Data tidak hilang walau HP di-uninstall/ganti browser.

## Fitur

Semua fitur asli tetap ada (Gacha, Market, Buy Role, Buy Assets, Top Up QRIS,
Redeem Code, Bulletin Board, Inventory) ditambah:

- **Login/Registrasi asli pakai server** (password di-hash, bukan disimpan
  polos).
- **Admin Panel tersembunyi dari player**, hanya muncul kalau akun kamu
  berstatus admin.
- **Team Members**: admin bisa tambah admin baru dengan isi USER NAME, EMAIL,
  NOMER WHATSAPP. Setelah di-APPROVE:
  - Sistem otomatis membuka WhatsApp (dari browser admin yang approve) ke
    nomor tersebut, dengan pesan bahwa email & username itu resmi jadi admin.
  - Kalau user dengan USERNAME itu **sudah** pernah daftar → langsung jadi
    admin saat itu juga.
  - Kalau user dengan USERNAME itu **belum** daftar → begitu dia daftar atau
    login pertama kali dengan username tsb, otomatis jadi admin.

  ⚠️ **Catatan jujur soal WhatsApp**: WhatsApp tidak menyediakan cara kirim
  pesan otomatis 100% tanpa sentuh apa pun kecuali pakai WhatsApp Business
  API resmi (berbayar, perlu approval Meta) atau layanan gateway pihak
  ketiga (misal Fonnte/Wablas, ada API key & biaya). Versi ini pakai cara
  `wa.me` seperti prototype awal: link WhatsApp terbuka otomatis dengan pesan
  sudah terisi lengkap, tinggal admin tekan **Send**. Kalau nanti mau upgrade
  ke kirim benar-benar otomatis tanpa sentuh, kasih tahu saya — saya bisa
  bantu integrasikan ke Fonnte/Wablas (butuh kamu daftar akun mereka dulu).

## Menjalankan di komputer (lokal)

Butuh [Node.js](https://nodejs.org) versi 18 ke atas terpasang.

```bash
npm install
cp .env.example .env
```

Buka file `.env`, isi:
- `JWT_SECRET` — ganti dengan teks acak bebas (rahasia).
- `BOOTSTRAP_ADMIN_USERNAME` — isi dengan **NAME** (bukan Grow ID) akun yang
  mau kamu jadikan admin pertama. Ini WAJIB diisi supaya ada admin pertama —
  setelah itu admin pertama bisa menambah admin lain lewat menu Team Members
  di dalam website, tidak perlu edit `.env` lagi.

Ganti juga `public/qris.png` dengan gambar QRIS asli kamu.

Jalankan:

```bash
npm start
```

Buka `http://localhost:3000` di browser. Daftar akun dengan NAME yang sama
persis dengan `BOOTSTRAP_ADMIN_USERNAME` → akun itu otomatis jadi admin.

## Deploy online (supaya bisa diakses publik / dari HP)

Rekomendasi termudah & gratis untuk pemula: **Render.com**.

1. Upload folder project ini ke GitHub (buat repo baru, push semua file
   kecuali yang ada di `.gitignore`).
2. Buka [render.com](https://render.com) → daftar/login → **New +** →
   **Web Service** → hubungkan ke repo GitHub kamu.
3. Isi konfigurasi:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Di bagian **Environment Variables**, tambahkan:
   - `JWT_SECRET` = teks rahasia bebas
   - `BOOTSTRAP_ADMIN_USERNAME` = NAME akun admin pertama kamu
5. Deploy. Setelah selesai, Render kasih URL publik (misal
   `https://crown-ps-store.onrender.com`) — itu link website kamu, bisa
   dibuka dari HP mana saja.

Alternatif lain yang juga gampang: Railway.app, atau VPS sendiri (pakai PM2
supaya server jalan terus).

⚠️ Catatan: paket gratis Render/Railway biasanya filesystem-nya **tidak
permanen** (reset saat redeploy/sleep) — artinya data di `data/db.json` dan
`uploads/` bisa hilang saat itu terjadi. Untuk toko yang serius jalan lama,
nanti sebaiknya upgrade ke database sungguhan (PostgreSQL/MySQL) yang
disediakan hosting — saya bisa bantu migrasikan kapan saja kalau sudah siap
ke tahap itu.

## Struktur folder

```
server.js         → server utama + semua API
lib/db.js         → penyimpanan data (file data/db.json)
lib/auth.js       → login/token & middleware admin
public/           → tampilan website (HTML/CSS/JS) — desainnya dipertahankan
                     sama seperti prototype asli
data/db.json       → "database" (dibuat otomatis saat server pertama nyala)
uploads/           → bukti transfer yang diupload user
```

## Yang berbeda dari prototype awal

- Password sekarang di-hash (aman), bukan disimpan polos di localStorage.
- Semua transaksi (beli item, gacha, top up) diproses & divalidasi di
  **server**, bukan di HP user — jadi tidak bisa dicurangi lewat console
  browser seperti prototype awal (`db.users.find(...).admin = true` tidak
  akan berfungsi lagi karena data bukan lagi di browser).
- Admin pertama diatur lewat `BOOTSTRAP_ADMIN_USERNAME`, admin selanjutnya
  lewat menu **Team Members** di Admin Panel.
