const jwt = require("jsonwebtoken");
const db = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "crown-ps-store-change-this-secret";

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: "30d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Belum login." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { users } = db.read();
    const user = users.find((u) => u.id === payload.uid);
    if (!user) return res.status(401).json({ error: "Akun tidak ditemukan." });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token tidak valid / kadaluarsa." });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.admin) {
    return res.status(403).json({ error: "Akses admin ditolak." });
  }
  next();
}

module.exports = { signToken, authMiddleware, adminMiddleware, JWT_SECRET };
