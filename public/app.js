// ====== State di sisi client (hanya cache tampilan; sumber data asli = server) ======
let TOKEN = localStorage.getItem("crown_token") || null;
let ME = null;
let STATE = { settings: {}, market: [], roles: [], assets: [], gacha: [] };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
const money = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

let toastTimer = null;
function toast(t) {
  const e = document.getElementById("toast");
  e.textContent = t;
  e.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => e.classList.remove("show"), 2600);
}
function closeModal() {
  document.getElementById("modal").classList.add("hide");
}
document.getElementById("xmodal").onclick = closeModal;
document.getElementById("modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };

// ====== API helper ======
async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch("/api" + path, { method, headers, body: payload });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

// ====== Nav (dikelompokkan per section, mengikuti struktur PLAYER PANEL) ======
const navGroups = [
  { items: [["home", "🏠", "Dashboard"]] },
  { items: [["gacha", "🎰", "Gacha"]] },
  { items: [["inventory", "🎒", "Inventory"]] },
  { label: "TOP UP", items: [["topup", "💳", "Top Up Saldo & Ticket"], ["payments", "📜", "Riwayat Top Up"]] },
  { label: "STORE", items: [["market", "🛒", "Market"], ["roles", "👑", "Buy Role"], ["assets", "🖼️", "Buy Assets"]] },
  { items: [["redeem", "🎟️", "Redeem Code"]] },
  { items: [["bulletin", "📢", "Bulletin Board"]] },
  { items: [["settings", "👤", "Profile"]] },
];
const playerNav = navGroups.flatMap((g) => g.items);
function nav() {
  let html = navGroups.map((g) => {
    const label = g.label ? `<div class="navlabel">${g.label}</div>` : "";
    const btns = g.items.map((x) => `<button class="navbtn" data-page="${x[0]}"><span class="navicon">${x[1]}</span>${x[2]}</button>`).join("");
    return label + btns;
  }).join("");
  if (ME.admin) html += `<div class="navlabel">OWNER</div><button class="navbtn" data-page="admin"><span class="navicon">🛠️</span>Admin Panel</button>`;
  document.getElementById("nav").innerHTML = html;
  document.querySelectorAll(".navbtn").forEach((b) => (b.onclick = () => go(b.dataset.page)));
}
function header() {
  const xp = ME.xp || 0, lv = Math.floor(xp / 100) + 1;
  document.getElementById("sideName").innerHTML = esc(ME.name) + (ME.admin ? `<span class="badge-admin">ADMIN</span>` : "");
  document.getElementById("sideGrow").textContent = ME.growId;
  document.getElementById("avatar").textContent = ME.name[0].toUpperCase();
  document.getElementById("bal").textContent = money(ME.balance);
  document.getElementById("tic").textContent = ME.tickets;
  document.getElementById("lvl").textContent = lv;
}
function go(p) {
  document.getElementById("side").classList.remove("open");
  document.getElementById("shade").classList.remove("show");
  document.querySelectorAll(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.page === p));
  document.getElementById("title").textContent = ([...playerNav, ["admin", "", "Admin Panel"]].find((x) => x[0] === p) || [])[2] || "Admin Panel";
  (pages[p] || admin)();
  scrollTo(0, 0);
}
async function refreshMe() {
  const { user } = await api("/me");
  ME = user;
  header();
  nav();
}

// ====== Home ======
function home() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">CROWN PRIVATE SERVER</div><h1>WELCOME BACK, ${esc(ME.name)} 👑</h1><p>Balance adalah mata uang utama. Gunakan untuk membeli Ticket, Market, Role, dan Assets.</p><div class="row"><button class="primary" onclick="go('gacha')">🎰 GACHA</button><button class="btn" onclick="go('topup')">💳 TOP UP SALDO</button></div></div><div class="grid"><div class="card"><div class="muted">Balance</div><h2>${money(ME.balance)}</h2></div><div class="card"><div class="muted">Gacha Ticket</div><h2>${ME.tickets}</h2></div><div class="card"><div class="muted">EXP / Level</div><h2>${ME.xp || 0} XP / Lv.${Math.floor((ME.xp || 0) / 100) + 1}</h2></div></div>`;
}

// ====== Inventory ======
function itemRow(x) {
  return `<div class="item"><div class="itemicon">${x.icon || "🎁"}</div><div class="grow"><b>${esc(x.name)}</b><div class="muted">${esc(x.rarity)} • Qty ${x.qty || 1} • ${esc(x.status || "Available")}</div></div><button class="btn" onclick="take('${encodeURIComponent(x.key)}')">DETAIL</button></div>`;
}
function inventory() {
  const a = Object.values(ME.inventory || {});
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">INVENTORY</div><h1>Hasil Gacha 🎒</h1><p>Hasil gacha tersimpan di inventory dan dapat dikirim ke owner.</p></div><div style="margin-top:14px">${a.length ? a.map(itemRow).join("") : `<div class="card empty">Inventory masih kosong.</div>`}</div>`;
}
function take(k) {
  const x = Object.values(ME.inventory || {}).find((z) => z.key === decodeURIComponent(k));
  if (!x) return;
  document.getElementById("modalbody").innerHTML = `<h2>${esc(x.name)}</h2><div class="notice">${esc(x.rarity)} • Qty ${x.qty}</div><div class="row" style="margin-top:12px"><button class="primary" onclick="sendItem('${encodeURIComponent(x.name)}','${encodeURIComponent(x.rarity)}','${x.qty}')">📲 KIRIM KE OWNER</button><button class="btn" onclick="markTaken('${encodeURIComponent(x.key)}')">TAKE ITEM</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function markTaken(k) {
  await api(`/inventory/${k}/take`, { method: "POST" });
  await refreshMe();
  closeModal();
  toast("Item ditandai Taken.");
  inventory();
}
function sendItem(n, r, q) {
  const t = `🎁 HASIL GACHA CROWN PS%0A%0A👤 Player: ${encodeURIComponent(ME.name)}%0A🌐 Grow ID: ${encodeURIComponent(ME.growId)}%0A🎁 Item: ${n}%0A⭐ Rarity: ${r}%0A📦 Amount: ${q}`;
  window.open(`https://wa.me/${STATE.settings.ownerWhatsApp}?text=${t}`, "_blank");
}

// ====== Gacha (Horizontal Slot Reel) ======
const RARITY_COLORS = { MYTHICAL: "#a85cff", LEGENDARY: "#ff9d3d", RARE: "#3da5ff", EPIC: "#ff4dd8", COMMON: "#5b5566", ZONK: "#ff5468" };
const FALLBACK_COLORS = ["#5b5566", "#3da5ff", "#ff9d3d", "#a85cff", "#ff4dd8", "#38d996", "#ffd166"];
function isZonk(r) { return String(r?.rarity || "").trim().toUpperCase() === "ZONK"; }
function colorFor(rarity, idx) { return RARITY_COLORS[String(rarity || "").toUpperCase()] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]; }

const CELL_W = 84;   // lebar 1 item
const CELL_GAP = 8;  // jarak antar item
const STEP = CELL_W + CELL_GAP;
const REEL_BEFORE = 26; // jumlah item acak sebelum item hasil (jarak putaran)
const REEL_AFTER = 8;   // jumlah item acak setelah item hasil (biar reel tetap "jalan" setelah berhenti)
const SPINNING = new Set();

function clientWeighted(rewards) {
  let n = Math.random() * rewards.reduce((s, x) => s + Number(x.chance), 0);
  for (const x of rewards) { n -= x.chance; if (n <= 0) return x; }
  return rewards[rewards.length - 1];
}
function cellHTML(r, idx) {
  const c = colorFor(r.rarity, idx);
  const icon = r.icon || (isZonk(r) ? "💀" : "🎁");
  return `<div class="reel-cell${isZonk(r) ? " reel-cell-zonk" : ""}" style="border-color:${c}"><span>${icon}</span><small style="color:${c}">${esc(r.rarity || "")}</small></div>`;
}
function idleReelHTML(rewards) {
  const arr = Array.from({ length: 14 }, () => clientWeighted(rewards));
  return arr.map((r, i) => cellHTML(r, i)).join("");
}
function renderGachaBox(g) {
  const legend = g.rewards.map((r, i) => `<div class="legendrow"><span class="dot" style="background:${colorFor(r.rarity, i)}"></span>${r.icon || "🎁"} ${esc(r.name)} <span class="muted">(${esc(r.rarity)} • ${r.chance}%)</span></div>`).join("");
  return `<div class="card wheelcard">
    <h3>${g.icon || "🎁"} ${esc(g.name)}</h3>
    <div class="reelwrap" id="reelwrap-${g.id}">
      <div class="reel-center-line"></div>
      <div class="reel-strip" id="reel-${g.id}">${idleReelHTML(g.rewards)}</div>
    </div>
    <div class="legend">${legend}</div>
    <div class="row spinrow" id="spinrow-${g.id}">
      <button class="btn" onclick="roll('${g.id}',1)">1x — ${STATE.settings.gachaCost} Ticket</button>
      <button class="primary" onclick="roll('${g.id}',5)">5x — ${STATE.settings.gachaCost * 5} Ticket</button>
      <button class="btn" onclick="roll('${g.id}',10)">10x — ${STATE.settings.gachaCost * 10} Ticket</button>
    </div>
  </div>`;
}

// ---- Gacha: realm selector (banner list) ----
function gachaBannerHTML(g) {
  return `<div class="realmcard" onclick="openGachaBox('${g.id}')">
    <div class="realmcard-body">
      <div class="eyebrow">${g.rewards.length} ITEM</div>
      <h2>${g.icon || "🎁"} ${esc(g.name)}</h2>
      <p class="muted">Cost ${STATE.settings.gachaCost} Ticket / spin</p>
    </div>
    <div class="realmcard-arrow">→</div>
  </div>`;
}
function gacha() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">WONY-STYLE SUMMON HALL</div><h1>Choose your realm 🎰</h1><p>Ticket kamu: <b>${ME.tickets}</b></p></div>
  <div style="margin-top:14px">${STATE.gacha.map(gachaBannerHTML).join("")}</div>
  <div class="realmcard minesbanner" onclick="openMines()">
    <div class="realmcard-body">
      <div class="eyebrow">MINI GAME</div>
      <h2>💎 Mines — Tebak Diamond</h2>
      <p class="muted">Buka kotak aman, hindari bom, cash out kapan saja.</p>
    </div>
    <div class="realmcard-arrow">→</div>
  </div>`;
}
function openGachaBox(id) {
  const g = STATE.gacha.find((x) => x.id === id);
  if (!g) return;
  document.getElementById("content").innerHTML = `<button class="btn" onclick="gacha()">← Kembali</button><div style="margin-top:12px">${renderGachaBox(g)}</div>`;
}

async function roll(gachaId, count) {
  count = count || 1;
  if (SPINNING.has(gachaId)) return;
  const g = STATE.gacha.find((x) => x.id === gachaId);
  let data;
  try {
    data = await api("/gacha/roll", { method: "POST", body: { gachaId, count } });
  } catch (e) { return toast(e.message); }

  if (count > 1) {
    await refreshMe();
    showMultiResults(data.results, data.level);
    return;
  }

  const result = data.results[0];
  SPINNING.add(gachaId);
  const row = document.getElementById("spinrow-" + gachaId);
  if (row) row.classList.add("spin-locked");
  const wrap = document.getElementById("reelwrap-" + gachaId);
  const strip = document.getElementById("reel-" + gachaId);

  // Bangun ulang reel: item acak, lalu item HASIL asli dari server disisipkan
  // di posisi tertentu, lalu beberapa item acak lagi sebagai "ekor".
  const cells = [];
  for (let i = 0; i < REEL_BEFORE; i++) cells.push(clientWeighted(g.rewards));
  const winIndex = REEL_BEFORE; // posisi item hasil
  cells.push(result);
  for (let i = 0; i < REEL_AFTER; i++) cells.push(clientWeighted(g.rewards));

  strip.style.transition = "none";
  strip.style.transform = "translateX(0px)";
  strip.innerHTML = cells.map((r, i) => cellHTML(r, i)).join("");
  // paksa reflow supaya reset transform benar-benar diterapkan sebelum animasi baru
  void strip.offsetWidth;

  const wrapWidth = wrap.clientWidth;
  const jitter = (Math.random() - 0.5) * (CELL_W * 0.4); // sedikit acak, tetap di dalam item
  const centerOfWinCell = winIndex * STEP + CELL_W / 2;
  const offset = centerOfWinCell - wrapWidth / 2 + jitter;

  requestAnimationFrame(() => {
    strip.style.transition = "transform 4.2s cubic-bezier(.1,.7,.15,1)";
    strip.style.transform = `translateX(${-offset}px)`;
  });

  setTimeout(async () => {
    SPINNING.delete(gachaId);
    if (row) row.classList.remove("spin-locked");
    await refreshMe();
    const zonk = isZonk(result);
    const icon = result.icon || (zonk ? "💀" : "🎁");
    document.getElementById("modalbody").innerHTML = zonk
      ? `<div class="spinbox spinbox-zonk"><div class="eyebrow">GACHA RESULT</div><div class="spinner">${icon}</div><h2>😢 ZONK!<br><span class="pill pill-zonk">Coba Lagi</span></h2><div class="muted" style="margin-top:9px">Belum beruntung kali ini • +25 EXP • Level ${data.level}</div></div>`
      : `<div class="spinbox"><div class="eyebrow">GACHA RESULT</div><div class="spinner">${icon}</div><h2>🎉 ${esc(result.name)}<br><span class="pill">${esc(result.rarity)}</span></h2><div class="muted" style="margin-top:9px">+25 EXP • Level ${data.level}</div></div>`;
    document.getElementById("modal").classList.remove("hide");
  }, 4400);
}
function showMultiResults(results, level) {
  const zonkCount = results.filter(isZonk).length;
  const winCount = results.length - zonkCount;
  document.getElementById("modalbody").innerHTML = `<div class="spinbox">
    <div class="eyebrow">GACHA RESULT — ${results.length}x SPIN</div>
    <h2>🎉 ${winCount} Item • 😢 ${zonkCount} Zonk</h2>
    <div class="multiresults">${results.map((r, i) => {
      const zonk = isZonk(r);
      const c = colorFor(r.rarity, i);
      const icon = r.icon || (zonk ? "💀" : "🎁");
      return `<div class="mrcell${zonk ? " mrcell-zonk" : ""}" style="border-color:${c}"><span>${icon}</span><small style="color:${c}">${esc(r.rarity || "")}</small></div>`;
    }).join("")}</div>
    <div class="muted" style="margin-top:9px">+${results.length * 25} EXP • Level ${level}</div>
  </div>`;
  document.getElementById("modal").classList.remove("hide");
}

// ====== Mines (Tebak Diamond) ======
let MINES_STATE = null;
function openMines() {
  document.getElementById("content").innerHTML = `<button class="btn" onclick="gacha()">← Kembali</button>
  <div class="hero" style="margin-top:12px"><div class="eyebrow">MINI GAME</div><h1>💎 Tebak Diamond</h1><p>Buka kotak aman, hindari bom. Cash out kapan saja sebelum kena bom!</p></div>
  <div id="minesArea" style="margin-top:14px"></div>`;
  loadMines();
}
async function loadMines() {
  try { const r = await api("/mines/state"); MINES_STATE = r.game; } catch (e) { MINES_STATE = null; }
  renderMines();
}
function renderMines() {
  const area = document.getElementById("minesArea");
  if (!area) return;
  if (!MINES_STATE || !MINES_STATE.active) {
    area.innerHTML = `<div class="card">
      <p class="muted">Pilih jumlah bomb, lalu mulai (${STATE.settings.minesCost || 1} Ticket). Grid 5x5 — makin banyak bomb, makin besar multiplier tiap kotak aman.</p>
      <div class="row">
        <button class="btn full" onclick="startMines(1)">💣 1 Bomb</button>
        <button class="btn full" onclick="startMines(2)">💣 2 Bomb</button>
        <button class="btn full" onclick="startMines(5)">💣 5 Bomb</button>
      </div>
    </div>`;
    return;
  }
  const g = MINES_STATE;
  const payout = Math.floor(g.cost * g.multiplier * 0.97);
  const cells = Array.from({ length: g.size }, (_, i) => {
    const revealed = g.revealed.includes(i);
    return `<button class="minecell${revealed ? " mine-revealed" : ""}" ${revealed ? "disabled" : ""} onclick="revealMine(${i})">${revealed ? "💎" : ""}</button>`;
  }).join("");
  area.innerHTML = `<div class="card">
    <div class="muted">Bomb: ${g.bombCount} • Terbuka: ${g.revealed.length} • Multiplier: <b>${g.multiplier}x</b></div>
    <div class="minegrid">${cells}</div>
    <button class="primary full" style="margin-top:10px" onclick="cashoutMines()" ${!g.revealed.length ? "disabled" : ""}>💰 CASH OUT${g.revealed.length ? ` — +${payout} Ticket` : ""}</button>
  </div>`;
}
async function startMines(bombCount) {
  try {
    const r = await api("/mines/start", { method: "POST", body: { bombCount } });
    MINES_STATE = r.game;
    await refreshMe();
    renderMines();
  } catch (e) { toast(e.message); }
}
async function revealMine(tile) {
  try {
    const r = await api("/mines/reveal", { method: "POST", body: { tile } });
    if (r.bomb) {
      renderMinesLost(r.bombs);
      await refreshMe();
      MINES_STATE = null;
      return;
    }
    MINES_STATE.revealed = r.revealed;
    MINES_STATE.multiplier = r.multiplier;
    renderMines();
  } catch (e) { toast(e.message); }
}
function renderMinesLost(bombs) {
  const area = document.getElementById("minesArea");
  if (!area || !MINES_STATE) return;
  const g = MINES_STATE;
  const cells = Array.from({ length: g.size }, (_, i) => {
    const isBomb = bombs.includes(i);
    const revealed = g.revealed.includes(i);
    return `<button class="minecell${revealed ? " mine-revealed" : ""}${isBomb ? " mine-bomb" : ""}" disabled>${isBomb ? "💣" : revealed ? "💎" : ""}</button>`;
  }).join("");
  area.innerHTML = `<div class="card"><h2 style="color:#ffb3bf">💥 KENA BOM!</h2><p class="muted">Ticket taruhan hangus.</p><div class="minegrid">${cells}</div><button class="btn full" style="margin-top:10px" onclick="loadMines()">MAIN LAGI</button></div>`;
}
async function cashoutMines() {
  try {
    const r = await api("/mines/cashout", { method: "POST" });
    toast(`+${r.payout} Ticket!`);
    await refreshMe();
    MINES_STATE = null;
    renderMines();
  } catch (e) { toast(e.message); }
}

// ====== Market / Roles / Assets ======
function cards(arr, fn) {
  return arr.map((p) => `<div class="card product"><div class="pic">${p.icon}</div><div class="body"><span class="pill">${esc(p.rarity || "ITEM")}</span><h3>${esc(p.name)}</h3><div class="muted">${esc(p.desc)}</div><div class="price">${money(p.price)}</div>${p.stock != null ? `<div class="muted">Stock ${p.stock} • Max/player ${p.limit}</div>` : ""}<button class="primary full" onclick="${fn}('${p.id}')">BUY NOW</button></div></div>`).join("");
}
function market() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">MARKET</div><h1>Market 🛒</h1><p>Semua pembelian menggunakan Balance.</p></div><div class="products">${cards(STATE.market, "buyMarket")}</div>`;
}
async function buyMarket(id) {
  try { await api("/market/buy", { method: "POST", body: { id } }); await refreshMe(); toast("Item berhasil dibeli."); }
  catch (e) { toast(e.message); }
}
function roles() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">BUY ROLE</div><h1>Role Store 👑</h1><p>Role dibeli dengan Balance.</p></div><div class="products">${cards(STATE.roles, "buyRole")}</div>`;
}
async function buyRole(id) {
  try { await api("/roles/buy", { method: "POST", body: { id } }); await refreshMe(); toast("Role berhasil dibeli."); }
  catch (e) { toast(e.message); }
}
function assets() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">BUY ASSETS</div><h1>Assets Store 🖼️</h1><p>Assets dibeli dengan Balance.</p></div><div class="products">${cards(STATE.assets, "buyAsset")}</div>`;
}
async function buyAsset(id) {
  try { await api("/assets/buy", { method: "POST", body: { id } }); await refreshMe(); toast("Asset berhasil dibeli."); }
  catch (e) { toast(e.message); }
}

// ====== Redeem ======
function redeem() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">REDEEM</div><h1>Redeem Code 🎟️</h1></div><div class="card" style="margin-top:14px"><input id="code" placeholder="CROWN2026"><button class="primary full" onclick="redeemCode()">REDEEM</button></div>`;
}
async function redeemCode() {
  try {
    const r = await api("/redeem", { method: "POST", body: { code: document.getElementById("code").value.trim() } });
    await refreshMe();
    toast(`+${r.tickets} Ticket`);
  } catch (e) { toast(e.message); }
}

// ====== Top Up ======
function topup() {
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">TOP UP</div><h1>Top Up 💳</h1><p>Pilih apakah ingin menambah Balance atau membeli Ticket memakai Balance.</p></div><div class="grid"><div class="card"><h2>💰 Top Up Saldo</h2><p class="muted">Minimum ${money(STATE.settings.minBalanceTopup)}. Nominal bebas di atas minimum.</p><input id="topAmount" type="number" min="${STATE.settings.minBalanceTopup}" step="1000" placeholder="Contoh: 50000"><select id="topMethod"><option value="">Pilih metode</option><option>QRIS</option></select><button class="primary full" onclick="continueBalance()">CONTINUE</button></div><div class="card"><h2>🎟️ Top Up Ticket</h2><p class="muted">Gunakan saldo website. Harga 1 ticket: ${money(STATE.settings.ticketPrice)}</p><input id="ticketQty" type="number" min="1" value="1"><div class="notice">Total: <b id="ticketTotal">${money(STATE.settings.ticketPrice)}</b></div><button class="primary full" onclick="buyTickets()">BUY TICKET</button></div></div>`;
  document.getElementById("ticketQty").oninput = () => (document.getElementById("ticketTotal").textContent = money(Math.max(1, +document.getElementById("ticketQty").value || 1) * STATE.settings.ticketPrice));
}
async function continueBalance() {
  const amount = +document.getElementById("topAmount").value;
  const method = document.getElementById("topMethod").value;
  try {
    const r = await api("/topup/balance", { method: "POST", body: { amount, method } });
    showQRIS(r.payment, r.qrisUrl);
  } catch (e) { toast(e.message); }
}
function showQRIS(p, qrisUrl) {
  document.getElementById("modalbody").innerHTML = `<div style="text-align:center"><div class="eyebrow">QRIS PAYMENT</div><h2>${money(p.amount)} SALDO</h2><img class="qris" src="${qrisUrl}"><a class="download" href="${qrisUrl}" download="CROWN-PS-QRIS.png">⬇ DOWNLOAD GAMBAR QRIS</a><div class="notice">Setelah membayar, tekan tombol di bawah.</div><button class="primary full" onclick="paid('${p.id}')">SUDAH BAYAR</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function paid(id) {
  await api(`/payments/${id}/paid`, { method: "POST" });
  closeModal();
  go("payments");
  toast("Transaksi pending. Upload bukti.");
}
async function buyTickets() {
  const q = Math.max(1, +document.getElementById("ticketQty").value || 1);
  try {
    await api("/tickets/buy", { method: "POST", body: { qty: q } });
    await refreshMe();
    toast(`+${q} Ticket dibeli.`);
  } catch (e) { toast(e.message); }
}

// ====== Payments ======
let PAYMENTS = [];
async function payments() {
  const r = await api("/payments");
  PAYMENTS = r.payments;
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">TOP UP</div><h1>Riwayat Top Up 📜</h1><p>Semua Top Up Saldo menunggu bukti dan approval admin.</p></div><div style="margin-top:14px">${PAYMENTS.length ? PAYMENTS.map((p) => `<div class="card" onclick="detailPay('${p.id}')" style="margin-bottom:9px;cursor:pointer"><b>${p.id}</b><div class="muted">${money(p.amount)} • ${p.method} • ${p.type === "balance" ? "SALDO" : "TICKET"}</div><span class="pill status-${p.status.toLowerCase().replace(/\s+/g, "-")}">${p.status}</span></div>`).join("") : `<div class="card empty">Belum ada transaksi.</div>`}</div>`;
}
function detailPay(id) {
  const p = PAYMENTS.find((x) => x.id === id);
  if (!p) return;
  if (p.status === "Pending Approval" || p.status === "Approved") return payThanksScreen(p);
  if (p.status === "Rejected") return payRejectedScreen(p);
  document.getElementById("modalbody").innerHTML = `<h2>Transaction Detail</h2><div class="notice" style="text-align:left">ID: ${p.id}<br>Type: ${p.type.toUpperCase()}<br>Amount: ${money(p.amount)}<br>Status: ${p.status}</div><label style="margin-top:12px">BUKTI TRANSAKSI (screenshot pembayaran)<input id="proof" type="file" accept="image/*"></label><button class="primary full" onclick="uploadProof('${p.id}')">📤 KIRIM ADMIN</button>`;
  document.getElementById("modal").classList.remove("hide");
}
function payThanksScreen(p) {
  const approved = p.status === "Approved";
  document.getElementById("modalbody").innerHTML = `<div style="text-align:center">
    <div class="eyebrow">${approved ? "TOP UP BERHASIL" : "TERIMA KASIH"}</div>
    <div class="spinner" style="height:auto;font-size:52px;margin:6px 0">${approved ? "✅" : "🙏"}</div>
    <h2>${approved ? "Saldo sudah masuk!" : "Terima kasih telah Top Up di CROWN PS!"}</h2>
    <p class="muted">${approved ? `Top up ${money(p.amount)} sudah disetujui admin dan saldo kamu sudah bertambah.` : "Bukti pembayaran kamu sudah terkirim ke admin dan sedang menunggu approval. Biar lebih cepat diproses, langsung DM owner ya."}</p>
    ${approved ? "" : `<button class="primary full" onclick="sendPayWA('${p.id}')">📲 DM OWNER</button>`}
  </div>`;
  document.getElementById("modal").classList.remove("hide");
}
function payRejectedScreen(p) {
  document.getElementById("modalbody").innerHTML = `<div style="text-align:center"><div class="eyebrow">DITOLAK</div><div class="spinner" style="height:auto;font-size:52px;margin:6px 0">❌</div><h2>Payment Ditolak</h2><p class="muted">Bukti pembayaran untuk ${money(p.amount)} ditolak admin. Hubungi owner untuk info lebih lanjut.</p><button class="btn full" onclick="sendPayWA('${p.id}')">📲 DM OWNER</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function uploadProof(id) {
  const f = document.getElementById("proof").files[0];
  if (!f) return toast("Pilih gambar bukti dulu.");
  const fd = new FormData();
  fd.append("proof", f);
  try {
    await api(`/payments/${id}/proof`, { method: "POST", body: fd, isForm: true });
    await payments();
    const p = PAYMENTS.find((x) => x.id === id);
    payThanksScreen(p);
  } catch (e) { toast(e.message); }
}
function sendPayWA(id) {
  const p = PAYMENTS.find((x) => x.id === id);
  const t = `🔔 TOP UP CROWN PS%0A%0A👤 Player: ${encodeURIComponent(ME.name)}%0A🌐 Grow ID: ${encodeURIComponent(ME.growId)}%0A💰 Amount: ${encodeURIComponent(money(p.amount))}%0A💳 Payment: ${p.method}%0A📌 Type: ${p.type}%0A🆔 Transaction: ${encodeURIComponent(p.id)}%0A%0AStatus: ${encodeURIComponent(p.status)}`;
  window.open(`https://wa.me/${STATE.settings.ownerWhatsApp}?text=${t}`, "_blank");
}

// ====== Bulletin ======
async function bulletin() {
  const r = await api("/bulletin");
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">COMMUNITY</div><h1>Bulletin Board 📢</h1><button class="primary" onclick="newReq()">＋ CREATE REQUEST</button></div><div style="margin-top:14px">${r.requests.map((x) => `<div class="card" style="margin-bottom:8px"><b>${esc(x.title)}</b><p class="muted">${esc(x.text)}</p><small>${esc(x.status)} • ${esc(x.playerName)}</small></div>`).join("") || `<div class="card empty">Belum ada request.</div>`}</div>`;
}
function newReq() {
  document.getElementById("modalbody").innerHTML = `<h2>Request Player</h2><label>JUDUL<input id="rqTitle"></label><label>ISI<textarea id="rqText" rows="5"></textarea></label><button class="primary full" onclick="saveReq()">KIRIM</button>`;
  document.getElementById("modal").classList.remove("hide");
}
async function saveReq() {
  const title = document.getElementById("rqTitle").value.trim();
  const text = document.getElementById("rqText").value.trim();
  if (!title || !text) return toast("Lengkapi request.");
  try {
    await api("/bulletin", { method: "POST", body: { title, text } });
    closeModal();
    bulletin();
    toast("Request terkirim.");
  } catch (e) { toast(e.message); }
}

// ====== Settings ======
function settings() {
  const xp = ME.xp || 0, lv = Math.floor(xp / 100) + 1;
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">PROFILE</div><h1>Profile 👤</h1><div class="notice" style="text-align:left;line-height:1.9">
    <b>Username:</b> ${esc(ME.name)}<br>
    <b>Grow ID:</b> ${esc(ME.growId)}<br>
    <b>Email:</b> ${esc(ME.email || "-")}<br>
    <b>WhatsApp:</b> ${esc(ME.phone || "-")}<br>
    <b>Level:</b> ${lv} • <b>XP:</b> ${xp}<br>
    <b>Balance:</b> ${money(ME.balance)}<br>
    <b>Gacha Ticket:</b> ${ME.tickets}
  </div></div>`;
}

// ====== Admin ======
let TEAM = [];
let ADMIN_TAB = "dashboard";
let ADMIN_PLAYERS = [];
let ADMIN_CODES = [];
let ADMIN_BULLETIN = [];
const adminTabs = [
  ["dashboard", "📊", "Dashboard"],
  ["team", "👥", "Team Members"],
  ["players", "👤", "Player Stats"],
  ["paymentApprove", "💳", "Payment Approve"],
  ["gacha", "🎰", "Gacha"],
  ["roles", "👑", "New Role"],
  ["market", "🛒", "Market"],
  ["economy", "⚙️", "Setting Ekonomi"],
  ["bulletin", "📢", "Bulletin Board"],
  ["codes", "🎟️", "Create Code Redeem"],
  ["adminSettings", "🔧", "Admin Settings"],
];
async function admin() {
  if (!ME.admin) return toast("Akses admin ditolak.");
  document.getElementById("content").innerHTML = `<div class="hero"><div class="eyebrow">OWNER CONTROL</div><h1>Admin Panel 🛠️</h1><p>Player tidak dapat melihat menu ini.</p></div>
  <div class="admintabs">${adminTabs.map((t) => `<button class="admintab${ADMIN_TAB === t[0] ? " active" : ""}" onclick="adminGo('${t[0]}')">${t[1]} ${t[2]}</button>`).join("")}</div>
  <div id="adminbody"><div class="empty">Loading…</div></div>`;
  await renderAdminTab();
}
function adminGo(tab) {
  ADMIN_TAB = tab;
  admin();
}
async function renderAdminTab() {
  const body = document.getElementById("adminbody");
  if (!body) return;
  try {
    if (ADMIN_TAB === "dashboard") return await renderAdminDashboard(body);
    if (ADMIN_TAB === "team") return await renderAdminTeam(body);
    if (ADMIN_TAB === "players") return await renderAdminPlayers(body);
    if (ADMIN_TAB === "paymentApprove") return await renderAdminPaymentApprove(body);
    if (ADMIN_TAB === "gacha") return (body.innerHTML = gachaAdminHTML());
    if (ADMIN_TAB === "roles") return (body.innerHTML = catalogListHTML("roles", "New Role", "👑"));
    if (ADMIN_TAB === "market") return (body.innerHTML = catalogListHTML("market", "Market Items", "🛒") + catalogListHTML("assets", "Buy Assets", "🖼️"));
    if (ADMIN_TAB === "economy") return renderAdminEconomy(body);
    if (ADMIN_TAB === "bulletin") return await renderAdminBulletin(body);
    if (ADMIN_TAB === "codes") return await renderAdminCodes(body);
    if (ADMIN_TAB === "adminSettings") return renderAdminSettings(body);
  } catch (e) { body.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}

// ---- Dashboard / Statistics ----
async function renderAdminDashboard(body) {
  const s = await api("/admin/stats");
  body.innerHTML = `
  <h2>📈 Statistics</h2>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="card"><div class="muted">Total Player</div><h2>${s.totalPlayers}</h2></div>
    <div class="card"><div class="muted">Total Saldo</div><h2>${money(s.totalBalance)}</h2></div>
    <div class="card"><div class="muted">Total Ticket</div><h2>${s.totalTickets}</h2></div>
    <div class="card"><div class="muted">Payment Pending</div><h2>${s.pendingPayments}</h2></div>
    <div class="card"><div class="muted">Pesan Bulletin Pending</div><h2>${s.pendingBulletin}</h2></div>
  </div>
  <h2 style="margin-top:22px">🎨 Dashboard Appearance</h2>
  <div class="notice" style="text-align:left">Upload Background / Logo / Banner / Hero Image / Icon / Announcement Image beserta <b>Resource Manager</b> (upload, rename, replace, delete gambar) belum tersedia di versi ini — perlu sistem penyimpanan file terpisah dulu. Minta aku bangun fitur ini kalau sudah siap lanjut ke situ.</div>`;
}

// ---- Team Members ----
async function renderAdminTeam(body) {
  const team = await api("/admin/team");
  TEAM = team.adminRequests;
  body.innerHTML = `<div class="subhead"><h2>👥 Team Members</h2><button class="btn" onclick="newAdminReq()">＋ TAMBAH ADMIN</button></div>
  <p class="muted">Saat di-approve, user dengan USERNAME tersebut otomatis jadi admin saat register/login.</p>
  <div class="card">${TEAM.length ? TEAM.map((r) => `<div class="item"><div class="grow"><b>${esc(r.username)}</b><div class="muted">EMAIL: ${esc(r.email)}<br>WHATSAPP: ${esc(r.number)}<br>Status: <span class="status-${r.status.toLowerCase()}">${r.status}</span></div></div>${r.status === "Pending" ? `<button class="btn" onclick="approveAdmin('${r.id}')">APPROVE</button><button class="btn" onclick="rejectAdmin('${r.id}')">REJECT</button>` : ""}</div>`).join("") : `<div class="empty">Belum ada Team Member.</div>`}</div>`;
}

// ---- Player Stats ----
async function renderAdminPlayers(body, q) {
  const r = await api("/admin/players" + (q ? "?q=" + encodeURIComponent(q) : ""));
  ADMIN_PLAYERS = r.players;
  body.innerHTML = `<h2>👤 Player Stats</h2>
  <input id="playerSearch" placeholder="Search player (username / grow id)..." value="${esc(q || "")}" style="margin-bottom:10px">
  <div class="card">${ADMIN_PLAYERS.length ? ADMIN_PLAYERS.map((p) => `<div class="item"><div class="itemicon">${(p.name || "?")[0].toUpperCase()}</div><div class="grow"><b>${esc(p.name)}${p.admin ? `<span class="badge-admin">ADMIN</span>` : ""}</b><div class="muted">${esc(p.growId)} • ${money(p.balance)} • 🎟️${p.tickets}</div></div><button class="btn" onclick="viewPlayer('${p.id}')">DETAIL</button></div>`).join("") : `<div class="empty">Player tidak ditemukan.</div>`}</div>`;
  const input = document.getElementById("playerSearch");
  let t;
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => renderAdminPlayers(body, input.value.trim()), 300); };
}
function viewPlayer(id) {
  const p = ADMIN_PLAYERS.find((x) => x.id === id);
  if (!p) return;
  const xp = p.xp || 0, lv = Math.floor(xp / 100) + 1;
  const inv = Object.values(p.inventory || {});
  document.getElementById("modalbody").innerHTML = `<h2>${esc(p.name)}</h2><div class="notice" style="text-align:left;line-height:1.9">
    <b>Grow ID:</b> ${esc(p.growId)}<br><b>Email:</b> ${esc(p.email || "-")}<br><b>WhatsApp:</b> ${esc(p.phone || "-")}<br>
    <b>Saldo:</b> ${money(p.balance)}<br><b>Ticket:</b> ${p.tickets}<br><b>Level:</b> ${lv} • <b>XP:</b> ${xp}
  </div>
  <h3 style="margin-top:14px">Inventory</h3>
  ${inv.length ? inv.map((x) => `<div class="item"><div class="itemicon">${x.icon || "🎁"}</div><div class="grow"><b>${esc(x.name)}</b><div class="muted">${esc(x.rarity)} • Qty ${x.qty || 1} • ${esc(x.status || "Available")}</div></div></div>`).join("") : `<div class="empty">Inventory kosong.</div>`}`;
  document.getElementById("modal").classList.remove("hide");
}

// ---- Payment Approve ----
async function renderAdminPaymentApprove(body) {
  const pay = await api("/admin/payments?status=" + encodeURIComponent("Pending Approval"));
  body.innerHTML = `<h2>💳 Payment Approve</h2>
  <div class="card">${pay.payments.length ? pay.payments.map((p) => `<div class="item"><div class="grow"><b>${p.id}</b><div class="muted">${esc(p.playerName)} • ${money(p.amount)} • ${p.type} • ${p.method}</div></div><button class="btn" onclick="reviewPay('${p.id}')">VIEW</button></div>`).join("") : `<div class="empty">Tidak ada pending payment.</div>`}</div>`;
}

// ---- Setting Ekonomi ----
function renderAdminEconomy(body) {
  body.innerHTML = `<h2>⚙️ Setting Ekonomi</h2>
  <div class="card">
    <label>HARGA GACHA (TICKET)<input id="ag" type="number" value="${STATE.settings.gachaCost}"></label>
    <label>HARGA 1 TICKET (SALDO → TICKET)<input id="ap" type="number" value="${STATE.settings.ticketPrice}"></label>
    <label>MINIMUM TOP UP SALDO<input id="am" type="number" value="${STATE.settings.minBalanceTopup}"></label>
    <div class="notice" style="text-align:left">Harga Role & Harga Market diatur langsung per-item di tab <b>New Role</b> / <b>Market</b>.</div>
    <button class="primary" onclick="saveEco()">SIMPAN ECONOMY</button>
  </div>`;
}
async function saveEco() {
  const body = {
    ticketPrice: +document.getElementById("ap").value,
    gachaCost: +document.getElementById("ag").value,
    minBalanceTopup: +document.getElementById("am").value,
  };
  const r = await api("/admin/economy", { method: "POST", body });
  STATE.settings = r.settings;
  renderAdminTab();
  toast("Economy disimpan.");
}

// ---- Bulletin Board (admin) ----
async function renderAdminBulletin(body) {
  const r = await api("/bulletin");
  ADMIN_BULLETIN = r.requests;
  body.innerHTML = `<h2>📢 Bulletin Board</h2>
  <div class="card">${ADMIN_BULLETIN.length ? ADMIN_BULLETIN.map((x) => `<div class="item"><div class="grow"><b>${esc(x.title)}</b><div class="muted">${esc(x.text)}</div><small>${esc(x.playerName)} • <span class="status-${x.status.toLowerCase()}">${esc(x.status)}</span></small></div>${x.status !== "Selesai" ? `<button class="btn" onclick="markBulletinDone('${x.id}')">TANDAI SELESAI</button>` : ""}</div>`).join("") : `<div class="empty">Belum ada pesan.</div>`}</div>`;
}
async function markBulletinDone(id) {
  try { await api(`/admin/bulletin/${id}/status`, { method: "POST", body: { status: "Selesai" } }); renderAdminTab(); toast("Ditandai selesai."); }
  catch (e) { toast(e.message); }
}

// ---- Create Code Redeem ----
async function renderAdminCodes(body) {
  const r = await api("/admin/codes");
  ADMIN_CODES = r.codes;
  body.innerHTML = `<div class="subhead"><h2>🎟️ Create Code Redeem</h2><button class="btn" onclick="newCode()">＋ CREATE CODE</button></div>
  <div class="card">${ADMIN_CODES.length ? ADMIN_CODES.map((c) => `<div class="item"><div class="grow"><b>${esc(c.code)}</b><div class="muted">+${c.tickets} Ticket • Klaim ${c.usedCount}${c.maxClaim ? "/" + c.maxClaim : ""}${c.expiredAt ? " • Exp " + esc(c.expiredAt) : ""} • ${c.active === false ? "🔴 Disabled" : "🟢 Active"}</div></div><button class="btn" onclick="toggleCode('${esc(c.code)}',${c.active === false})">${c.active === false ? "AKTIFKAN" : "NONAKTIFKAN"}</button><button class="btn" onclick="deleteCode('${esc(c.code)}')">HAPUS</button></div>`).join("") : `<div class="empty">Belum ada code.</div>`}</div>`;
}
function newCode() {
  document.getElementById("modalbody").innerHTML = `<h2>Create Code Redeem</h2><label>CODE<input id="cd_code" placeholder="CROWN2026"></label><label>REWARD TICKET (AMOUNT)<input id="cd_tickets" type="number" value="5"></label><label>MAX CLAIM (kosongkan = unlimited)<input id="cd_max" type="number"></label><label>EXPIRED (kosongkan = tidak pernah)<input id="cd_exp" type="date"></label><div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitCode()">SIMPAN</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function submitCode() {
  const body = {
    code: document.getElementById("cd_code").value.trim(),
    tickets: +document.getElementById("cd_tickets").value,
    maxClaim: document.getElementById("cd_max").value ? +document.getElementById("cd_max").value : null,
    expiredAt: document.getElementById("cd_exp").value || null,
  };
  if (!body.code || !body.tickets) return toast("Code & reward ticket wajib diisi.");
  try { await api("/admin/codes", { method: "POST", body }); closeModal(); renderAdminTab(); toast("Code dibuat."); }
  catch (e) { toast(e.message); }
}
async function toggleCode(code, makeActive) {
  try { await api(`/admin/codes/${encodeURIComponent(code)}`, { method: "PUT", body: { active: makeActive } }); renderAdminTab(); toast(makeActive ? "Code diaktifkan." : "Code dinonaktifkan."); }
  catch (e) { toast(e.message); }
}
async function deleteCode(code) {
  try { await api(`/admin/codes/${encodeURIComponent(code)}`, { method: "DELETE" }); renderAdminTab(); toast("Code dihapus."); }
  catch (e) { toast(e.message); }
}

// ---- Admin Settings ----
function renderAdminSettings(body) {
  body.innerHTML = `<h2>🔧 Admin Settings</h2>
  <div class="card">
    <label>NOMOR WHATSAPP OWNER<input id="aw" value="${esc(STATE.settings.ownerWhatsApp)}"></label>
    <div class="notice" style="text-align:left">💳 <b>Payment Method aktif:</b> QRIS. Metode lain (DANA/OVO/GOPAY/ShopeePay) belum terhubung ke payment gateway — perlu integrasi tambahan.</div>
    <button class="primary" onclick="saveAdminSettings()">SIMPAN</button>
  </div>`;
}
async function saveAdminSettings() {
  const body = { ownerWhatsApp: document.getElementById("aw").value };
  try { const r = await api("/admin/economy", { method: "POST", body }); STATE.settings = r.settings; renderAdminTab(); toast("Admin Settings disimpan."); }
  catch (e) { toast(e.message); }
}
async function refreshState() {
  STATE = await api("/state");
}

// ---- Gacha reward management ----
function gachaAdminHTML() {
  return `<div class="subhead"><h2>🎰 Gacha Management</h2><button class="btn" onclick="newGachaBox()">＋ TAMBAH BOX</button></div>` + STATE.gacha.map((g) => `
    <div class="card" style="margin-top:10px">
      <div class="subhead" style="margin:0 0 8px"><h3 style="margin:0">${g.icon} ${esc(g.name)}</h3><div class="cactions"><button class="btn" onclick="editGachaBox('${g.id}')">EDIT BOX</button><button class="btn" onclick="deleteGachaBox('${g.id}')">HAPUS BOX</button></div></div>
      ${g.rewards.map((r) => `<div class="catitem"><div class="cicon">${r.icon}</div><div class="cbody"><b>${esc(r.name)}</b><div class="muted">${esc(r.rarity)} • Chance ${r.chance}%</div></div><div class="cactions"><button class="btn" onclick="editReward('${g.id}','${r.id}')">EDIT</button><button class="btn" onclick="deleteReward('${g.id}','${r.id}')">HAPUS</button></div></div>`).join("")}
      <button class="btn full" style="margin-top:8px" onclick="newReward('${g.id}')">＋ TAMBAH REWARD</button>
    </div>`).join("");
}
function newGachaBox() {
  document.getElementById("modalbody").innerHTML = `<h2>Tambah Gacha Box</h2><label>NAMA BOX<input id="gb_name"></label><label>ICON (emoji)<input id="gb_icon" value="🎁"></label><div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitGachaBox()">SIMPAN</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function submitGachaBox() {
  const name = document.getElementById("gb_name").value.trim();
  const icon = document.getElementById("gb_icon").value.trim() || "🎁";
  if (!name) return toast("Nama box wajib diisi.");
  try { await api("/admin/gacha", { method: "POST", body: { name, icon } }); await refreshState(); closeModal(); admin(); toast("Box ditambahkan."); }
  catch (e) { toast(e.message); }
}
function editGachaBox(id) {
  const g = STATE.gacha.find((x) => x.id === id);
  if (!g) return;
  document.getElementById("modalbody").innerHTML = `<h2>Edit Box</h2><label>NAMA BOX<input id="gb_name" value="${esc(g.name)}"></label><label>ICON<input id="gb_icon" value="${esc(g.icon)}"></label><div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitEditGachaBox('${id}')">SIMPAN</button><button class="btn" onclick="deleteGachaBox('${id}')">HAPUS</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function submitEditGachaBox(id) {
  const name = document.getElementById("gb_name").value.trim();
  const icon = document.getElementById("gb_icon").value.trim() || "🎁";
  try { await api(`/admin/gacha/${id}`, { method: "PUT", body: { name, icon } }); await refreshState(); closeModal(); admin(); toast("Box diperbarui."); }
  catch (e) { toast(e.message); }
}
async function deleteGachaBox(id) {
  try { await api(`/admin/gacha/${id}`, { method: "DELETE" }); await refreshState(); closeModal(); admin(); toast("Box dihapus."); }
  catch (e) { toast(e.message); }
}
function newReward(gachaId) {
  document.getElementById("modalbody").innerHTML = `<h2>Tambah Reward</h2><label>NAMA<input id="rw_name" placeholder="Contoh: Zonk"></label><label>RARITY<input id="rw_rarity" placeholder="MYTHICAL / LEGENDARY / RARE / COMMON / ZONK"></label><label>CHANCE (%)<input id="rw_chance" type="number" step="0.01"></label><label>ICON (emoji)<input id="rw_icon" value="🎁"></label><div class="notice" style="text-align:left">💡 Isi RARITY dengan <b>ZONK</b> untuk membuat reward "meleset" — player tidak dapat item apapun, cuma dapat EXP. Cocok biar gacha lebih menegangkan.</div><div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitReward('${gachaId}')">SIMPAN</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
function editReward(gachaId, rewardId) {
  const g = STATE.gacha.find((x) => x.id === gachaId);
  const r = g && g.rewards.find((x) => x.id === rewardId);
  if (!r) return;
  document.getElementById("modalbody").innerHTML = `<h2>Edit Reward</h2><label>NAMA<input id="rw_name" value="${esc(r.name)}"></label><label>RARITY<input id="rw_rarity" value="${esc(r.rarity)}" placeholder="MYTHICAL / LEGENDARY / RARE / COMMON / ZONK"></label><label>CHANCE (%)<input id="rw_chance" type="number" step="0.01" value="${r.chance}"></label><label>ICON<input id="rw_icon" value="${esc(r.icon)}"></label><div class="notice" style="text-align:left">💡 RARITY <b>ZONK</b> = player tidak dapat item, cuma EXP.</div><div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitReward('${gachaId}','${rewardId}')">SIMPAN</button><button class="btn" onclick="deleteReward('${gachaId}','${rewardId}')">HAPUS</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function submitReward(gachaId, rewardId) {
  const body = {
    name: document.getElementById("rw_name").value.trim(),
    rarity: document.getElementById("rw_rarity").value.trim(),
    chance: +document.getElementById("rw_chance").value,
    icon: document.getElementById("rw_icon").value.trim() || "🎁",
  };
  if (!body.name || !body.rarity || !body.chance) return toast("Lengkapi nama, rarity, chance.");
  try {
    if (rewardId) await api(`/admin/gacha/${gachaId}/rewards/${rewardId}`, { method: "PUT", body });
    else await api(`/admin/gacha/${gachaId}/rewards`, { method: "POST", body });
    await refreshState(); closeModal(); admin(); toast("Reward tersimpan.");
  } catch (e) { toast(e.message); }
}
async function deleteReward(gachaId, rewardId) {
  try { await api(`/admin/gacha/${gachaId}/rewards/${rewardId}`, { method: "DELETE" }); await refreshState(); closeModal(); admin(); toast("Reward dihapus."); }
  catch (e) { toast(e.message); }
}

// ---- Katalog toko: market / roles / assets ----
function catalogListHTML(key, title, icon) {
  const items = STATE[key] || [];
  const rows = items.map((it) => `<div class="catitem"><div class="cicon">${it.icon || "🎁"}</div><div class="cbody"><b>${esc(it.name)}</b><div class="muted">${money(it.price)}${it.stock != null ? ` • Stock ${it.stock} • Max ${it.limit}` : ""}</div></div><div class="cactions"><button class="btn" onclick="editCatalog('${key}','${it.id}')">EDIT</button><button class="btn" onclick="deleteCatalog('${key}','${it.id}')">HAPUS</button></div></div>`).join("");
  return `<div class="subhead"><h2>${icon} ${title}</h2><button class="btn" onclick="newCatalog('${key}')">＋ TAMBAH</button></div><div class="card">${rows || `<div class="empty">Belum ada item.</div>`}</div>`;
}
function catalogFormFields(key, it) {
  it = it || {};
  let extra = "";
  if (key === "market") {
    extra = `<label>RARITY<input id="cf_rarity" value="${esc(it.rarity || "")}"></label><label>LIMIT PER PLAYER<input id="cf_limit" type="number" value="${it.limit ?? 3}"></label><label>STOCK<input id="cf_stock" type="number" value="${it.stock ?? 10}"></label>`;
  }
  return `<label>NAMA<input id="cf_name" value="${esc(it.name || "")}"></label><label>HARGA<input id="cf_price" type="number" value="${it.price ?? 0}"></label><label>ICON (emoji)<input id="cf_icon" value="${esc(it.icon || "🎁")}"></label><label>DESKRIPSI<textarea id="cf_desc" rows="2">${esc(it.desc || "")}</textarea></label>${extra}`;
}
function newCatalog(key) {
  document.getElementById("modalbody").innerHTML = `<h2>Tambah Item</h2>${catalogFormFields(key)}<div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitCatalog('${key}')">SIMPAN</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
function editCatalog(key, id) {
  const it = (STATE[key] || []).find((x) => x.id === id);
  if (!it) return;
  document.getElementById("modalbody").innerHTML = `<h2>Edit Item</h2>${catalogFormFields(key, it)}<div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitCatalog('${key}','${id}')">SIMPAN</button><button class="btn" onclick="deleteCatalog('${key}','${id}')">HAPUS</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function submitCatalog(key, id) {
  const body = {
    name: document.getElementById("cf_name").value.trim(),
    price: +document.getElementById("cf_price").value,
    icon: document.getElementById("cf_icon").value.trim() || "🎁",
    desc: document.getElementById("cf_desc").value.trim(),
  };
  if (key === "market") {
    body.rarity = document.getElementById("cf_rarity").value.trim();
    body.limit = +document.getElementById("cf_limit").value;
    body.stock = +document.getElementById("cf_stock").value;
  }
  if (!body.name) return toast("Nama wajib diisi.");
  try {
    if (id) await api(`/admin/${key}/${id}`, { method: "PUT", body });
    else await api(`/admin/${key}`, { method: "POST", body });
    await refreshState(); closeModal(); admin(); toast("Tersimpan.");
  } catch (e) { toast(e.message); }
}
async function deleteCatalog(key, id) {
  try { await api(`/admin/${key}/${id}`, { method: "DELETE" }); await refreshState(); closeModal(); admin(); toast("Item dihapus."); }
  catch (e) { toast(e.message); }
}
function newAdminReq() {
  document.getElementById("modalbody").innerHTML = `<h2>ADMIN MEMBER</h2><label>USER NAME<input id="an"></label><label>EMAIL ADMIN<input id="ae" type="email"></label><label>NOMER ADMIN<input id="aw2" placeholder="628xxxxxxxxxx"></label><div class="row"><button class="btn" onclick="closeModal()">BATAL</button><button class="primary" onclick="submitAdminReq()">SUBMIT</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function submitAdminReq() {
  const username = document.getElementById("an").value.trim();
  const email = document.getElementById("ae").value.trim();
  const phone = document.getElementById("aw2").value.trim();
  if (!username || !email || !phone) return toast("Lengkapi data admin.");
  try {
    await api("/admin/team", { method: "POST", body: { username, email, phone } });
    closeModal();
    admin();
    toast("Admin Member masuk Pending.");
  } catch (e) { toast(e.message); }
}
async function approveAdmin(id) {
  try {
    const r = await api(`/admin/team/${id}/approve`, { method: "POST" });
    if (r.waLink) window.open(r.waLink, "_blank");
    admin();
    toast("Approved. WhatsApp verifikasi dibuka.");
  } catch (e) { toast(e.message); }
}
async function rejectAdmin(id) {
  await api(`/admin/team/${id}/reject`, { method: "POST" });
  admin();
  toast("Admin Member dibatalkan.");
}
async function reviewPay(id) {
  const p = await (await fetch(`/api/admin/payments`, { headers: { Authorization: "Bearer " + TOKEN } })).json();
  const item = p.payments.find((x) => x.id === id);
  document.getElementById("modalbody").innerHTML = `<h2>${item.id}</h2><div class="notice">Player: ${esc(item.playerName)}<br>Type: ${item.type}<br>Amount: ${money(item.amount)}<br>Status: ${item.status}</div>${item.proof ? `<img class="qris" src="${item.proof}">` : "<div class='empty'>Bukti belum diupload.</div>"}<div class="row"><button class="primary" onclick="approvePay('${id}')">APPROVE</button><button class="btn" onclick="rejectPay('${id}')">REJECT</button></div>`;
  document.getElementById("modal").classList.remove("hide");
}
async function approvePay(id) {
  try {
    const r = await api(`/admin/payments/${id}/approve`, { method: "POST" });
    closeModal();
    admin();
    toast(`+${money(r.amount)} saldo ke ${r.playerName}`);
  } catch (e) { toast(e.message); }
}
async function rejectPay(id) {
  await api(`/admin/payments/${id}/reject`, { method: "POST" });
  closeModal();
  admin();
  toast("Payment ditolak.");
}

const pages = { home, inventory, market, gacha, roles, assets, redeem, bulletin, topup, payments, settings, admin };

// ====== Auth forms ======
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  document.getElementById("loginForm").classList.toggle("hide", b.dataset.t !== "login");
  document.getElementById("regForm").classList.toggle("hide", b.dataset.t !== "register");
}));

document.getElementById("regForm").onsubmit = async (e) => {
  e.preventDefault();
  const rgErr = document.getElementById("rgErr");
  rgErr.textContent = "";
  const pass = document.getElementById("rgPass").value, confirm = document.getElementById("rgConfirm").value;
  if (pass !== confirm) return (rgErr.textContent = "Password tidak sama.");
  try {
    const r = await api("/register", {
      method: "POST",
      body: {
        growId: document.getElementById("rgGrow").value.trim(),
        name: document.getElementById("rgName").value.trim(),
        password: pass,
        confirmPassword: confirm,
        referral: document.getElementById("rgRef").value.trim(),
        email: document.getElementById("rgEmail").value.trim(),
        phone: document.getElementById("rgPhone").value.trim(),
      },
    });
    TOKEN = r.token;
    localStorage.setItem("crown_token", TOKEN);
    ME = r.user;
    toast("Akun dibuat: +10 Ticket GRATIS");
    await boot();
  } catch (e) { rgErr.textContent = e.message; }
};

document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const lgErr = document.getElementById("lgErr");
  lgErr.textContent = "";
  try {
    const r = await api("/login", {
      method: "POST",
      body: {
        growId: document.getElementById("lgGrow").value.trim(),
        name: document.getElementById("lgName").value.trim(),
        password: document.getElementById("lgPass").value,
      },
    });
    TOKEN = r.token;
    localStorage.setItem("crown_token", TOKEN);
    ME = r.user;
    await boot();
  } catch (e) { lgErr.textContent = e.message; }
};

async function start() {
  document.getElementById("auth").classList.add("hide");
  document.getElementById("app").classList.remove("hide");
  nav();
  header();
  go("home");
}

function openSide() { document.getElementById("side").classList.add("open"); document.getElementById("shade").classList.add("show"); }
function closeSideNav() { document.getElementById("side").classList.remove("open"); document.getElementById("shade").classList.remove("show"); }
document.getElementById("menu").onclick = openSide;
document.getElementById("closeSide").onclick = closeSideNav;
document.getElementById("shade").onclick = closeSideNav;
document.getElementById("logout").onclick = () => { localStorage.removeItem("crown_token"); location.reload(); };

async function boot() {
  const s = await api("/state");
  STATE = s;
  if (TOKEN) {
    try {
      const me = await api("/me");
      ME = me.user;
      await start();
      return;
    } catch (e) {
      localStorage.removeItem("crown_token");
      TOKEN = null;
    }
  }
}
boot();
