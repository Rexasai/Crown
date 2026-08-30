// Simple file-based JSON database.
// Cukup untuk skala toko kecil-menengah. Semua tulis-baca lewat modul ini
// supaya konsisten dan tidak bentrok (pakai antrian tulis sederhana).

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const seed = {
  settings: {
    ticketPrice: 5000,
    minBalanceTopup: 10000,
    gachaCost: 1,
    minesCost: 1,
    ownerWhatsApp: "6285177475595",
  },
  users: [],
  market: [
    { id: "rayman", name: "Mythical Rayman", rarity: "MYTHICAL", price: 50000, limit: 3, stock: 10, icon: "🟣", desc: "Mythical item." },
    { id: "spray", name: "World Spray", rarity: "RARE", price: 15000, limit: 3, stock: 25, icon: "🔵", desc: "Special item." },
    { id: "phoenix", name: "Phoenix Wings", rarity: "LEGENDARY", price: 35000, limit: 2, stock: 8, icon: "🔥", desc: "Legendary item." },
  ],
  roles: [
    { id: "vip", name: "[VIP]", price: 25000, icon: "👑", desc: "VIP Role" },
    { id: "dev", name: "[DEV]", price: 50000, icon: "⚡", desc: "Developer Role" },
  ],
  assets: [
    { id: "aura", name: "Crown Aura", price: 30000, icon: "✨", desc: "Premium asset" },
    { id: "title", name: "CROWN Title", price: 20000, icon: "🏆", desc: "Exclusive title" },
  ],
  gacha: [
    {
      id: "box",
      name: "MYTHICAL BOX",
      icon: "🎁",
      rewards: [
        { id: "r1", name: "Mythical Rayman", rarity: "MYTHICAL", chance: 1, icon: "🟣" },
        { id: "r2", name: "Phoenix Wings", rarity: "LEGENDARY", chance: 5, icon: "🔥" },
        { id: "r3", name: "World Spray", rarity: "RARE", chance: 24, icon: "🔵" },
        { id: "r4", name: "Common Item", rarity: "COMMON", chance: 50, icon: "⚪" },
        { id: "r5", name: "Zonk", rarity: "ZONK", chance: 20, icon: "💀" },
      ],
    },
  ],
  codes: [{ code: "CROWN2026", tickets: 5, maxClaim: null, expiredAt: null, active: true, used: [] }],
  payments: [],
  requests: [],
  adminRequests: [],
  minesGames: [],
  // Username (lowercase) yang sudah di-approve jadi admin tapi belum
  // (atau sudah) match dengan akun user. Dipakai buat auto-jadi-admin
  // saat register/login.
  approvedAdminUsernames: [],
};

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
  }
}

ensureFile();

let cache = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
let writeQueue = Promise.resolve();

function read() {
  return cache;
}

function write(mutatorFn) {
  // mutatorFn(db) mutates `cache` in place. Its return value is ignored on
  // purpose -- routes use `return (error = "...")` as an early-exit pattern,
  // so we must NOT treat that return value as a replacement for the db.
  writeQueue = writeQueue.then(() => {
    mutatorFn(cache);
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
    return cache;
  });
  return writeQueue;
}

module.exports = { read, write };
