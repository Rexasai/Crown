require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const db = require("./lib/db");
const { signToken, authMiddleware, adminMiddleware } = require("./lib/auth");

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      cb(null, newid("PROOF") + path.extname(file.originalname || ".jpg"));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Upload icon/gambar item (market, role, asset, gacha reward) -- khusus admin.
// Dibatasi tipe gambar aja (PNG/JPG/WEBP/GIF) biar nggak disalahgunakan buat
// upload file sembarangan.
const uploadIcon = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      cb(null, newid("ICON") + path.extname(file.originalname || ".png"));
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(new Error("File harus berupa gambar PNG/JPG/WEBP/GIF."));
    cb(null, true);
  },
});

// ---------- helpers ----------
function newid(prefix) {
  return prefix + "_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
}
function money(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}
function addInv(u, x) {
  u.inventory = u.inventory || {};
  const k = x.name + "|" + x.rarity;
  if (u.inventory[k]) u.inventory[k].qty += x.qty || 1;
  else u.inventory[k] = { ...x, key: k, qty: x.qty || 1, status: "Available" };
}
function weighted(arr) {
  let n = Math.random() * arr.reduce((s, x) => s + Number(x.chance), 0);
  for (const x of arr) {
    n -= x.chance;
    if (n <= 0) return x;
  }
  return arr[arr.length - 1];
}
function waLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
// Cek & terapkan status admin otomatis kalau username user ini pernah
// di-approve lewat Team Members (Admin Panel).
function applyAutoAdmin(dbState, user) {
  const uname = user.name.toLowerCase();
  if (!user.admin && dbState.approvedAdminUsernames.includes(uname)) {
    user.admin = true;
    user.adminSince = new Date().toISOString();
  }
}

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  const { growId, name, password, referral, email, deviceId } = req.body || {};
  if (!growId || !name || !password) return res.status(400).json({ error: "Lengkapi semua data." });
  if (!email || !String(email).includes("@") || !String(email).includes(".")) return res.status(400).json({ error: "Email wajib diisi dengan format yang benar." });
  if (password.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });

  const state = db.read();
  const exists = state.users.some(
    (u) => u.growId.toLowerCase() === growId.trim().toLowerCase() && u.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (exists) return res.status(400).json({ error: "Akun sudah ada." });

  // Anti multi-akun (best-effort): 1 HP/perangkat cuma dapet ticket gratis 1x.
  // deviceId dikirim dari localStorage browser -- bukan proteksi absolut
  // (bisa ditembus dengan clear data / incognito), tapi cukup buat mencegah
  // farming akun casual.
  const dId = String(deviceId || "").trim();
  const deviceAlreadyClaimed = dId && state.devices.includes(dId);
  const ticketBonus = deviceAlreadyClaimed ? 0 : 10;

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: newid("USR"),
    growId: growId.trim(),
    name: name.trim(),
    passwordHash,
    referral: (referral || "").trim(),
    email: String(email).trim(),
    phone: "",
    balance: 0,
    tickets: ticketBonus,
    xp: 0,
    inventory: {},
    gachaHistory: [],
    purchases: {},
    roles: [],
    assets: [],
    admin: false,
    deviceId: dId || null,
    createdAt: new Date().toISOString(),
  };

  await db.write((d) => {
    applyAutoAdmin(d, user);
    d.users.push(user);
    if (dId && !d.devices.includes(dId)) d.devices.push(dId);
  });

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user), ticketBonus });
});

app.post("/api/login", async (req, res) => {
  const { growId, name, password } = req.body || {};
  const state = db.read();
  const user = state.users.find(
    (u) => u.growId.toLowerCase() === (growId || "").trim().toLowerCase() && u.name.toLowerCase() === (name || "").trim().toLowerCase()
  );
  if (!user) return res.status(400).json({ error: "Login salah." });
  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Login salah." });

  await db.write((d) => {
    const u = d.users.find((x) => x.id === user.id);
    applyAutoAdmin(d, u);
  });

  const token = signToken(user.id);
  const fresh = db.read().users.find((x) => x.id === user.id);
  res.json({ token, user: publicUser(fresh) });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ================= PUBLIC STORE CONFIG =================
app.get("/api/state", (req, res) => {
  const { settings, market, roles, assets, gacha } = db.read();
  res.json({ settings, market, roles, assets, gacha });
});

app.get("/api/bulletin", (req, res) => {
  const { requests } = db.read();
  res.json({ requests: requests.slice().reverse() });
});

app.post("/api/bulletin", authMiddleware, async (req, res) => {
  const { title, text } = req.body || {};
  if (!title || !text) return res.status(400).json({ error: "Lengkapi request." });
  const item = { id: newid("REQ"), userId: req.user.id, playerName: req.user.name, title, text, status: "Pending" };
  await db.write((d) => {
    d.requests.push(item);
  });
  res.json({ ok: true, item });
});

app.post("/api/admin/bulletin/:id/status", authMiddleware, adminMiddleware, async (req, res) => {
  const allowed = ["Pending", "Dibaca", "Selesai"];
  const status = req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status tidak valid." });
  let error = null;
  await db.write((d) => {
    const r = d.requests.find((x) => x.id === req.params.id);
    if (!r) return (error = "Request tidak ditemukan.");
    r.status = status;
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true });
});

// ================= GACHA / MARKET / ROLES / ASSETS =================
app.post("/api/gacha/roll", authMiddleware, async (req, res) => {
  const { gachaId } = req.body || {};
  const count = Math.max(1, Math.min(10, +(req.body?.count) || 1));
  const state = db.read();
  const g = state.gacha.find((x) => x.id === gachaId);
  if (!g) return res.status(404).json({ error: "Gacha tidak ditemukan." });
  const cost = state.settings.gachaCost * count;

  let result;
  await db.write((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    if (u.tickets < cost) return; // handled below via flag
    u.tickets -= cost;
    const results = [];
    for (let i = 0; i < count; i++) {
      const r = weighted(g.rewards);
      const zonk = String(r.rarity || "").trim().toUpperCase() === "ZONK";
      u.xp = (u.xp || 0) + 25;
      if (!zonk) addInv(u, { name: r.name, rarity: r.rarity, icon: r.icon, qty: 1 });
      u.gachaHistory.push({ ...r, zonk, time: new Date().toISOString() });
      results.push({ ...r, zonk });
    }
    result = { results, tickets: u.tickets, xp: u.xp, level: Math.floor(u.xp / 100) + 1 };
  });

  if (!result) return res.status(400).json({ error: "Ticket tidak cukup." });
  res.json(result);
});

// ================= MINES (Tebak Diamond) =================
function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function minesMultiplier(size, bombs, revealedCount) {
  let m = 1;
  for (let i = 0; i < revealedCount; i++) m *= (size - i) / (size - i - bombs);
  return m;
}
function sanitizeMines(g) {
  if (!g) return null;
  return {
    id: g.id,
    size: g.size,
    bombCount: g.bombCount,
    revealed: g.revealed,
    active: g.active,
    cost: g.cost,
    multiplier: +minesMultiplier(g.size, g.bombCount, g.revealed.length).toFixed(4),
  };
}

app.get("/api/mines/state", authMiddleware, (req, res) => {
  const { minesGames } = db.read();
  const g = minesGames.find((x) => x.userId === req.user.id && x.active);
  res.json({ game: sanitizeMines(g) });
});

app.post("/api/mines/start", authMiddleware, async (req, res) => {
  const bombCount = +req.body?.bombCount;
  if (![1, 2, 5].includes(bombCount)) return res.status(400).json({ error: "Pilih jumlah bomb 1, 2, atau 5." });
  const size = 25;
  let error = null,
    game = null;
  await db.write((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    const existing = d.minesGames.find((x) => x.userId === u.id && x.active);
    if (existing) return (error = "Selesaikan game Mines yang sedang berjalan.");
    const cost = d.settings.minesCost || 1;
    if (u.tickets < cost) return (error = "Ticket tidak cukup.");
    u.tickets -= cost;
    const bombs = shuffleIndices(size).slice(0, bombCount);
    game = { id: newid("MINE"), userId: u.id, size, bombCount, bombs, revealed: [], cost, active: true, createdAt: new Date().toISOString() };
    d.minesGames.push(game);
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true, game: sanitizeMines(game), tickets: db.read().users.find((x) => x.id === req.user.id).tickets });
});

app.post("/api/mines/reveal", authMiddleware, async (req, res) => {
  const tile = +req.body?.tile;
  let error = null,
    result = null;
  await db.write((d) => {
    const g = d.minesGames.find((x) => x.userId === req.user.id && x.active);
    if (!g) return (error = "Tidak ada game Mines aktif.");
    if (!(tile >= 0 && tile < g.size)) return (error = "Tile tidak valid.");
    if (g.revealed.includes(tile)) return (error = "Tile sudah dibuka.");
    if (g.bombs.includes(tile)) {
      g.active = false;
      result = { bomb: true, bombs: g.bombs, revealed: g.revealed };
    } else {
      g.revealed.push(tile);
      const multiplier = minesMultiplier(g.size, g.bombCount, g.revealed.length);
      result = { bomb: false, revealed: g.revealed, multiplier: +multiplier.toFixed(4) };
    }
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true, ...result });
});

app.post("/api/mines/cashout", authMiddleware, async (req, res) => {
  let error = null,
    payout = 0,
    tickets = 0;
  await db.write((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    const g = d.minesGames.find((x) => x.userId === u.id && x.active);
    if (!g) return (error = "Tidak ada game Mines aktif.");
    if (!g.revealed.length) return (error = "Buka minimal 1 tile sebelum cashout.");
    const multiplier = minesMultiplier(g.size, g.bombCount, g.revealed.length);
    payout = Math.floor(g.cost * multiplier * 0.97);
    u.tickets += payout;
    g.active = false;
    tickets = u.tickets;
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true, payout, tickets });
});

app.post("/api/market/buy", authMiddleware, async (req, res) => {
  const { id } = req.body || {};
  let error = null,
    ok = false;
  await db.write((d) => {
    const p = d.market.find((x) => x.id === id);
    const u = d.users.find((x) => x.id === req.user.id);
    if (!p) return (error = "Item tidak ditemukan.");
    const c = u.purchases[id] || 0;
    if (p.stock <= 0) return (error = "Stock habis.");
    if (c >= p.limit) return (error = "Limit pembelian tercapai.");
    if (u.balance < p.price) return (error = "Saldo tidak cukup.");
    u.balance -= p.price;
    p.stock--;
    u.purchases[id] = c + 1;
    addInv(u, { name: p.name, rarity: p.rarity, icon: p.icon, qty: 1 });
    ok = true;
  });
  if (!ok) return res.status(400).json({ error: error || "Gagal membeli." });
  res.json({ ok: true, user: publicUser(db.read().users.find((x) => x.id === req.user.id)) });
});

app.post("/api/roles/buy", authMiddleware, async (req, res) => {
  const { id } = req.body || {};
  let error = null,
    ok = false;
  await db.write((d) => {
    const p = d.roles.find((x) => x.id === id);
    const u = d.users.find((x) => x.id === req.user.id);
    if (!p) return (error = "Role tidak ditemukan.");
    if (u.balance < p.price) return (error = "Saldo tidak cukup.");
    u.balance -= p.price;
    u.roles.push(p.name);
    ok = true;
  });
  if (!ok) return res.status(400).json({ error: error || "Gagal membeli." });
  res.json({ ok: true, user: publicUser(db.read().users.find((x) => x.id === req.user.id)) });
});

app.post("/api/assets/buy", authMiddleware, async (req, res) => {
  const { id } = req.body || {};
  let error = null,
    ok = false;
  await db.write((d) => {
    const p = d.assets.find((x) => x.id === id);
    const u = d.users.find((x) => x.id === req.user.id);
    if (!p) return (error = "Asset tidak ditemukan.");
    if (u.balance < p.price) return (error = "Saldo tidak cukup.");
    u.balance -= p.price;
    u.assets.push(p.name);
    ok = true;
  });
  if (!ok) return res.status(400).json({ error: error || "Gagal membeli." });
  res.json({ ok: true, user: publicUser(db.read().users.find((x) => x.id === req.user.id)) });
});

app.post("/api/tickets/buy", authMiddleware, async (req, res) => {
  const qty = Math.max(1, +req.body?.qty || 1);
  let error = null,
    ok = false;
  await db.write((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    const total = qty * d.settings.ticketPrice;
    if (u.balance < total) return (error = "Saldo tidak cukup.");
    u.balance -= total;
    u.tickets += qty;
    ok = true;
  });
  if (!ok) return res.status(400).json({ error: error || "Gagal membeli ticket." });
  res.json({ ok: true, user: publicUser(db.read().users.find((x) => x.id === req.user.id)) });
});

app.post("/api/redeem", authMiddleware, async (req, res) => {
  const code = (req.body?.code || "").trim().toUpperCase();
  let error = null,
    ok = false,
    tickets = 0;
  await db.write((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    const x = d.codes.find((z) => z.code === code);
    if (!x) return (error = "Kode tidak ditemukan.");
    if (x.active === false) return (error = "Kode sudah tidak aktif.");
    if (x.expiredAt && new Date(x.expiredAt) < new Date()) return (error = "Kode sudah kadaluarsa.");
    if (x.maxClaim && x.used.length >= x.maxClaim) return (error = "Kode sudah mencapai batas klaim.");
    if (x.used.includes(u.id)) return (error = "Kode sudah digunakan.");
    u.tickets += x.tickets;
    x.used.push(u.id);
    tickets = x.tickets;
    ok = true;
  });
  if (!ok) return res.status(400).json({ error: error || "Gagal redeem." });
  res.json({ ok: true, tickets, user: publicUser(db.read().users.find((x) => x.id === req.user.id)) });
});

app.post("/api/inventory/:key/take", authMiddleware, async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  await db.write((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    if (u.inventory[key]) u.inventory[key].status = "Taken";
  });
  res.json({ ok: true, user: publicUser(db.read().users.find((x) => x.id === req.user.id)) });
});

// ================= TOP UP / PAYMENTS =================
app.post("/api/topup/balance", authMiddleware, async (req, res) => {
  const amount = +req.body?.amount || 0;
  const method = req.body?.method || "";
  const state = db.read();
  if (!method) return res.status(400).json({ error: "Pilih metode pembayaran." });
  if (amount < state.settings.minBalanceTopup)
    return res.status(400).json({ error: `Minimum top up saldo ${money(state.settings.minBalanceTopup)}.` });

  const payment = {
    id: newid("TOPUP"),
    userId: req.user.id,
    type: "balance",
    amount,
    method,
    status: "Waiting Payment",
    proof: null,
    time: new Date().toISOString(),
  };
  await db.write((d) => {
    d.payments.push(payment);
  });
  res.json({ payment, qrisUrl: "/qris.png" });
});

app.post("/api/payments/:id/paid", authMiddleware, async (req, res) => {
  let error = null;
  await db.write((d) => {
    const p = d.payments.find((x) => x.id === req.params.id && x.userId === req.user.id);
    if (!p) return (error = "Transaksi tidak ditemukan.");
    p.status = "Awaiting Proof";
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true });
});

app.post("/api/payments/:id/proof", authMiddleware, upload.single("proof"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Pilih gambar bukti." });
  let error = null;
  await db.write((d) => {
    const p = d.payments.find((x) => x.id === req.params.id && x.userId === req.user.id);
    if (!p) return (error = "Transaksi tidak ditemukan.");
    p.proof = "/uploads/" + req.file.filename;
    p.status = "Pending Approval";
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true });
});

app.get("/api/payments", authMiddleware, (req, res) => {
  const { payments } = db.read();
  res.json({ payments: payments.filter((p) => p.userId === req.user.id).reverse() });
});

// ================= ADMIN =================
app.get("/api/admin/payments", authMiddleware, adminMiddleware, (req, res) => {
  const { payments, users } = db.read();
  const status = req.query.status;
  const list = (status ? payments.filter((p) => p.status === status) : payments)
    .slice()
    .reverse()
    .map((p) => ({ ...p, playerName: users.find((u) => u.id === p.userId)?.name || "?" }));
  res.json({ payments: list });
});

app.post("/api/admin/payments/:id/approve", authMiddleware, adminMiddleware, async (req, res) => {
  let error = null,
    result = null;
  await db.write((d) => {
    const p = d.payments.find((x) => x.id === req.params.id);
    if (!p) return (error = "Payment tidak ditemukan.");
    if (p.status === "Approved") return (error = "Sudah di-approve.");
    const u = d.users.find((x) => x.id === p.userId);
    u.balance += p.amount;
    p.status = "Approved";
    result = { amount: p.amount, playerName: u.name };
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true, ...result });
});

app.post("/api/admin/payments/:id/reject", authMiddleware, adminMiddleware, async (req, res) => {
  let error = null;
  await db.write((d) => {
    const p = d.payments.find((x) => x.id === req.params.id);
    if (!p) return (error = "Payment tidak ditemukan.");
    p.status = "Rejected";
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true });
});

app.post("/api/admin/economy", authMiddleware, adminMiddleware, async (req, res) => {
  const { ticketPrice, gachaCost, minBalanceTopup, ownerWhatsApp, serverIp, serverName, whatsappGroupLink, discordInviteLink, whatsappIcon, discordIcon } = req.body || {};
  await db.write((d) => {
    if (ticketPrice != null) d.settings.ticketPrice = Math.max(1, +ticketPrice);
    if (gachaCost != null) d.settings.gachaCost = Math.max(1, +gachaCost);
    if (minBalanceTopup != null) d.settings.minBalanceTopup = Math.max(1, +minBalanceTopup);
    if (ownerWhatsApp) d.settings.ownerWhatsApp = String(ownerWhatsApp).replace(/\D/g, "");
    if (serverIp != null) d.settings.serverIp = String(serverIp).trim();
    if (serverName != null) d.settings.serverName = String(serverName).trim();
    if (whatsappGroupLink != null) d.settings.whatsappGroupLink = String(whatsappGroupLink).trim();
    if (discordInviteLink != null) d.settings.discordInviteLink = String(discordInviteLink).trim();
    if (whatsappIcon !== undefined) d.settings.whatsappIcon = whatsappIcon || null;
    if (discordIcon !== undefined) d.settings.discordIcon = discordIcon || null;
  });
  res.json({ ok: true, settings: db.read().settings });
});

// ---- Team Members (kelola admin) ----
app.get("/api/admin/team", authMiddleware, adminMiddleware, (req, res) => {
  const { adminRequests } = db.read();
  res.json({ adminRequests: adminRequests.slice().reverse() });
});

app.post("/api/admin/team", authMiddleware, adminMiddleware, async (req, res) => {
  const { username, email, phone } = req.body || {};
  if (!username || !email || !phone) return res.status(400).json({ error: "Lengkapi data admin." });
  const item = {
    id: newid("ADM"),
    username: username.trim(),
    email: email.trim(),
    number: String(phone).replace(/\D/g, ""),
    status: "Pending",
    addedBy: req.user.name,
    time: new Date().toISOString(),
  };
  await db.write((d) => {
    d.adminRequests.push(item);
  });
  res.json({ ok: true, item });
});

app.post("/api/admin/team/:id/approve", authMiddleware, adminMiddleware, async (req, res) => {
  let error = null,
    link = null,
    entry = null;
  await db.write((d) => {
    const r = d.adminRequests.find((x) => x.id === req.params.id);
    if (!r) return (error = "Request tidak ditemukan.");
    r.status = "Approved";
    const uname = r.username.toLowerCase();
    if (!d.approvedAdminUsernames.includes(uname)) d.approvedAdminUsernames.push(uname);
    // Kalau usernya sudah pernah daftar, langsung jadikan admin sekarang juga.
    const existing = d.users.find((x) => x.name.toLowerCase() === uname);
    if (existing) {
      existing.admin = true;
      existing.adminSince = new Date().toISOString();
    }
    const msg =
      `👑 CROWN PS - ADMIN VERIFICATION\n\n` +
      `Halo ${r.username}.\n\n` +
      `Email ${r.email} telah diverifikasi resmi sebagai ADMIN CROWN PS.\n` +
      `Username "${r.username}" sekarang berstatus ADMIN ✅\n` +
      (existing
        ? `Silakan login kembali untuk mengakses Admin Panel.`
        : `Saat kamu mendaftar/login di website dengan username ini, kamu otomatis akan menjadi Admin.`);
    link = waLink(r.number, msg);
    entry = r;
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true, waLink: link, item: entry });
});

app.post("/api/admin/team/:id/reject", authMiddleware, adminMiddleware, async (req, res) => {
  let error = null;
  await db.write((d) => {
    const r = d.adminRequests.find((x) => x.id === req.params.id);
    if (!r) return (error = "Request tidak ditemukan.");
    r.status = "Rejected";
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true });
});

// ---- Dashboard Statistics ----
app.get("/api/admin/stats", authMiddleware, adminMiddleware, (req, res) => {
  const { users, payments, requests } = db.read();
  res.json({
    totalPlayers: users.length,
    totalBalance: users.reduce((s, u) => s + (u.balance || 0), 0),
    totalTickets: users.reduce((s, u) => s + (u.tickets || 0), 0),
    pendingPayments: payments.filter((p) => p.status === "Pending Approval").length,
    pendingBulletin: requests.filter((r) => r.status === "Pending").length,
  });
});

// ---- Player Stats ----
app.get("/api/admin/players", authMiddleware, adminMiddleware, (req, res) => {
  const { users } = db.read();
  const q = String(req.query.q || "").toLowerCase().trim();
  const list = users
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.growId.toLowerCase().includes(q))
    .map(publicUser)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  res.json({ players: list });
});

// ---- Create Code Redeem (admin) ----
app.get("/api/admin/codes", authMiddleware, adminMiddleware, (req, res) => {
  const { codes } = db.read();
  res.json({ codes: codes.map((c) => ({ ...c, usedCount: c.used.length })) });
});
app.post("/api/admin/codes", authMiddleware, adminMiddleware, async (req, res) => {
  const { code, tickets, maxClaim, expiredAt } = req.body || {};
  const c = String(code || "").trim().toUpperCase();
  if (!c || !tickets) return res.status(400).json({ error: "Code & reward ticket wajib diisi." });
  if (!/^[A-Z0-9_-]+$/.test(c)) return res.status(400).json({ error: "Code hanya boleh huruf, angka, - dan _ (tanpa spasi)." });
  const state = db.read();
  if (state.codes.some((x) => x.code === c)) return res.status(400).json({ error: "Code sudah ada." });
  const item = {
    code: c,
    tickets: Math.max(1, +tickets),
    maxClaim: maxClaim ? Math.max(1, +maxClaim) : null,
    expiredAt: expiredAt || null,
    active: true,
    used: [],
  };
  await db.write((d) => d.codes.push(item));
  res.json({ ok: true, item });
});
app.put("/api/admin/codes/:code", authMiddleware, adminMiddleware, async (req, res) => {
  const b = req.body || {};
  let error = null;
  await db.write((d) => {
    const c = d.codes.find((x) => x.code === req.params.code);
    if (!c) return (error = "Code tidak ditemukan.");
    if (b.tickets != null) c.tickets = Math.max(1, +b.tickets);
    if (b.maxClaim !== undefined) c.maxClaim = b.maxClaim ? Math.max(1, +b.maxClaim) : null;
    if (b.expiredAt !== undefined) c.expiredAt = b.expiredAt || null;
    if (b.active != null) c.active = !!b.active;
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true });
});
app.delete("/api/admin/codes/:code", authMiddleware, adminMiddleware, async (req, res) => {
  await db.write((d) => {
    d.codes = d.codes.filter((x) => x.code !== req.params.code);
  });
  res.json({ ok: true });
});

// ---- Upload icon/gambar (admin) ----
app.post("/api/admin/upload-icon", authMiddleware, adminMiddleware, (req, res) => {
  uploadIcon.single("icon")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload gagal." });
    if (!req.file) return res.status(400).json({ error: "File tidak ditemukan." });
    res.json({ ok: true, url: "/uploads/" + req.file.filename });
  });
});

// ---- CRUD generik untuk katalog toko (market / roles / assets) ----
function catalogCrud(key, itemPrefix) {
  // CREATE
  app.post(`/api/admin/${key}`, authMiddleware, adminMiddleware, async (req, res) => {
    const b = req.body || {};
    if (!b.name || b.price == null) return res.status(400).json({ error: "Nama & harga wajib diisi." });
    const item = {
      id: newid(itemPrefix),
      name: String(b.name).trim(),
      price: Math.max(0, +b.price || 0),
      icon: b.icon || "🎁",
      desc: b.desc || "",
    };
    if (b.rarity) item.rarity = b.rarity;
    if (b.limit != null) item.limit = Math.max(1, +b.limit || 1);
    if (b.stock != null) item.stock = Math.max(0, +b.stock || 0);
    await db.write((d) => d[key].push(item));
    res.json({ ok: true, item });
  });
  // UPDATE
  app.put(`/api/admin/${key}/:id`, authMiddleware, adminMiddleware, async (req, res) => {
    const b = req.body || {};
    let error = null,
      item = null;
    await db.write((d) => {
      const it = d[key].find((x) => x.id === req.params.id);
      if (!it) return (error = "Item tidak ditemukan.");
      if (b.name != null) it.name = String(b.name).trim();
      if (b.price != null) it.price = Math.max(0, +b.price || 0);
      if (b.icon != null) it.icon = b.icon;
      if (b.desc != null) it.desc = b.desc;
      if (b.rarity != null) it.rarity = b.rarity;
      if (b.limit != null) it.limit = Math.max(1, +b.limit || 1);
      if (b.stock != null) it.stock = Math.max(0, +b.stock || 0);
      item = it;
    });
    if (error) return res.status(404).json({ error });
    res.json({ ok: true, item });
  });
  // DELETE
  app.delete(`/api/admin/${key}/:id`, authMiddleware, adminMiddleware, async (req, res) => {
    await db.write((d) => {
      d[key] = d[key].filter((x) => x.id !== req.params.id);
    });
    res.json({ ok: true });
  });
}
catalogCrud("market", "ITM");
catalogCrud("roles", "ROLE");
catalogCrud("assets", "ASSET");

// ---- Gacha box & reward management ----
app.post("/api/admin/gacha", authMiddleware, adminMiddleware, async (req, res) => {
  const { name, icon, banner } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nama box wajib diisi." });
  const box = { id: newid("BOX"), name: String(name).trim(), icon: icon || "🎁", banner: banner || null, rewards: [] };
  await db.write((d) => d.gacha.push(box));
  res.json({ ok: true, box });
});

app.put("/api/admin/gacha/:gachaId", authMiddleware, adminMiddleware, async (req, res) => {
  const { name, icon, banner } = req.body || {};
  let error = null;
  await db.write((d) => {
    const g = d.gacha.find((x) => x.id === req.params.gachaId);
    if (!g) return (error = "Box tidak ditemukan.");
    if (name != null) g.name = String(name).trim();
    if (icon != null) g.icon = icon;
    if (banner !== undefined) g.banner = banner || null;
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true });
});

app.delete("/api/admin/gacha/:gachaId", authMiddleware, adminMiddleware, async (req, res) => {
  await db.write((d) => {
    d.gacha = d.gacha.filter((x) => x.id !== req.params.gachaId);
  });
  res.json({ ok: true });
});

app.post("/api/admin/gacha/:gachaId/rewards", authMiddleware, adminMiddleware, async (req, res) => {
  const { name, rarity, chance, icon } = req.body || {};
  if (!name || !rarity || chance == null) return res.status(400).json({ error: "Lengkapi nama, rarity, dan chance reward." });
  let error = null,
    reward = null;
  await db.write((d) => {
    const g = d.gacha.find((x) => x.id === req.params.gachaId);
    if (!g) return (error = "Box tidak ditemukan.");
    reward = { id: newid("RWD"), name: String(name).trim(), rarity: String(rarity).trim().toUpperCase(), chance: Math.max(0.01, +chance), icon: icon || "🎁" };
    g.rewards.push(reward);
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true, reward });
});

app.put("/api/admin/gacha/:gachaId/rewards/:rewardId", authMiddleware, adminMiddleware, async (req, res) => {
  const b = req.body || {};
  let error = null;
  await db.write((d) => {
    const g = d.gacha.find((x) => x.id === req.params.gachaId);
    if (!g) return (error = "Box tidak ditemukan.");
    const r = g.rewards.find((x) => x.id === req.params.rewardId);
    if (!r) return (error = "Reward tidak ditemukan.");
    if (b.name != null) r.name = String(b.name).trim();
    if (b.rarity != null) r.rarity = String(b.rarity).trim().toUpperCase();
    if (b.chance != null) r.chance = Math.max(0.01, +b.chance);
    if (b.icon != null) r.icon = b.icon;
  });
  if (error) return res.status(404).json({ error });
  res.json({ ok: true });
});

app.delete("/api/admin/gacha/:gachaId/rewards/:rewardId", authMiddleware, adminMiddleware, async (req, res) => {
  let error = null;
  await db.write((d) => {
    const g = d.gacha.find((x) => x.id === req.params.gachaId);
    if (!g) return (error = "Box tidak ditemukan.");
    if (g.rewards.length <= 1) return (error = "Minimal harus ada 1 reward di dalam box.");
    g.rewards = g.rewards.filter((x) => x.id !== req.params.rewardId);
  });
  if (error) return res.status(400).json({ error });
  res.json({ ok: true });
});

// fallback ke SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- bootstrap admin pertama ----------
// Supaya tidak perlu admin lama buat menyetujui admin pertama (ayam & telur),
// set BOOTSTRAP_ADMIN_USERNAME di file .env dengan username (NAME) akun kamu.
// Begitu server nyala, username itu otomatis ditandai sebagai admin yang
// disetujui -- sama seperti kalau di-approve lewat Team Members.
async function bootstrapAdmin() {
  const raw = process.env.BOOTSTRAP_ADMIN_USERNAME;
  if (!raw) return;
  const names = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return;
  await db.write((d) => {
    names.forEach((uname) => {
      if (!d.approvedAdminUsernames.includes(uname)) d.approvedAdminUsernames.push(uname);
      const existing = d.users.find((x) => x.name.toLowerCase() === uname);
      if (existing && !existing.admin) {
        existing.admin = true;
        existing.adminSince = new Date().toISOString();
      }
    });
  });
  console.log("Bootstrap admin username(s) aktif:", names.join(", "));
}

bootstrapAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`CROWN PS Store server running on http://localhost:${PORT}`);
  });
});
