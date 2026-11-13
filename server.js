/*
 * 留白教室 White Space｜網站 + 後台
 * ----------------------------------------------------------
 * 前台：  /          讀 data/content.json 顯示內容
 * 後台：  /admin     登入後可編輯內容、上傳圖片
 *
 * 環境變數：
 *   PORT              預設 3000
 *   ADMIN_PASSWORD    本機：第一次啟動時的管理員密碼（之後可在後台修改）
 *                     線上（Vercel）：後台密碼，必填，要改就改這個環境變數
 *   DATA_DIR          本機：內容與上傳檔案存放位置，預設 ./data
 *   TRUST_PROXY=1     放在 Nginx / 雲端平台後面（HTTPS）時設定
 *   BLOB_READ_WRITE_TOKEN  有設定就改用 Vercel Blob 儲存（Vercel 連結 Blob 後會自動帶入）
 *   SESSION_SECRET    （選填）登入 cookie 的簽章金鑰
 */
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./storage");
const icons = require("./icons");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const ONLINE = store.mode === "blob";          // 線上（Vercel Blob）還是本機檔案
const PUBLIC_DIR = path.join(ROOT, "public");
const ADMIN_DIR = path.join(ROOT, "admin");
const VIEW_FILE = path.join(ROOT, "views", "index.html");

/* ---------------- 密碼 ---------------- */
function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString("hex") };
}
function checkPassword(pw, rec) {
  if (!rec || typeof pw !== "string" || !pw) return false;
  const h = crypto.scryptSync(pw, rec.salt, 64);
  const expected = Buffer.from(rec.hash, "hex");
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

/* 本機：密碼存在 data/auth.json。線上：密碼來自環境變數 ADMIN_PASSWORD */
let onlineAuth = null;
function getAuth() {
  if (ONLINE) {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return null;
    if (!onlineAuth || onlineAuth.pw !== pw) {
      onlineAuth = {
        pw,
        rec: hashPassword(pw),
        secret: process.env.SESSION_SECRET || crypto.createHash("sha256").update("ws-session:" + pw).digest("hex")
      };
    }
    return onlineAuth;
  }
  let a = store.readAuth();
  if (!a) {
    let pw = process.env.ADMIN_PASSWORD;
    if (!pw) {
      pw = crypto.randomBytes(6).toString("base64url");
      console.log("\n==============================================");
      console.log("  沒有設定 ADMIN_PASSWORD，已產生臨時密碼：");
      console.log("  " + pw);
      console.log("  請登入後台後立刻到「帳號」修改密碼。");
      console.log("==============================================\n");
    }
    a = { ...hashPassword(pw), secret: crypto.randomBytes(32).toString("hex") };
    store.writeAuth(a);
  } else if (!a.secret) {
    a.secret = crypto.randomBytes(32).toString("hex");
    store.writeAuth(a);
  }
  return { rec: a, secret: a.secret };
}
if (!ONLINE) getAuth();                          // 本機：啟動時就建立好帳號

/* ---------------- Session（簽章 cookie，不需要伺服器記憶體） ---------------- */
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 天
const sign = (secret, exp) => crypto.createHmac("sha256", secret).update(String(exp)).digest("base64url");

function makeToken(secret) {
  const exp = Date.now() + SESSION_TTL;
  return `${exp.toString(36)}.${sign(secret, exp)}`;
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  const t = parseCookies(req).ws_session;
  const auth = getAuth();
  if (!t || !auth) return false;
  const [expB36, mac] = t.split(".");
  const exp = parseInt(expB36, 36);
  if (!exp || !mac || exp < Date.now()) return false;
  const good = Buffer.from(sign(auth.secret, exp));
  const given = Buffer.from(mac);
  return good.length === given.length && crypto.timingSafeEqual(good, given);
}
function setSessionCookie(req, res, token, maxAgeMs) {
  const parts = [`ws_session=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (req.secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/* 登入失敗次數限制：每個 IP 15 分鐘內最多 8 次（線上是每個執行個體各自計算） */
const loginFails = new Map();
function tooManyFails(ip) {
  const r = loginFails.get(ip);
  if (!r) return false;
  if (r.until < Date.now()) { loginFails.delete(ip); return false; }
  return r.count >= 8;
}
function addFail(ip) {
  const r = loginFails.get(ip) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
  r.count++;
  loginFails.set(ip, r);
}

/* ---------------- 內容驗證 ---------------- */
const SRC_RE = /^\/(assets|uploads)\/[A-Za-z0-9._-]+$/;
const POS_RE = /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;

const DEFAULT_BANNER = "#ffffff";
const colorOf = v => (/^#[0-9a-fA-F]{6}$/.test(v || "") ? v.toLowerCase() : DEFAULT_BANNER);
const isDark = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
};

/* 首頁選單：沒有設定過（舊資料）就用這組預設 */
const DEFAULT_MENU = [
  { label: "Bulletin Board", icon: "board", href: "#works" },
  { label: "Teacher", icon: "owl", href: "" },
  { label: "Classroom Activities", icon: "plane", href: "" },
  { label: "Weekly diary", icon: "book", href: "" },
  { label: "Instagram", icon: "instagram", href: "" }
];
const HREF_RE = /^(#[\w-]*|\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+)$/i;
function cleanMenu(list) {
  if (!Array.isArray(list)) return DEFAULT_MENU.map(m => ({ ...m }));
  return list.slice(0, 8).map(m => {
    m = m && typeof m === "object" ? m : {};
    const href = typeof m.href === "string" ? m.href.trim().slice(0, 300) : "";
    return {
      label: str(m.label, 40),
      icon: icons.ICONS[m.icon] ? m.icon : "",
      href: HREF_RE.test(href) ? href : ""
    };
  }).filter(m => m.label);
}

const str = (v, max) => (typeof v === "string" ? v : "").slice(0, max).trim();

function cleanImage(img) {
  if (!img || typeof img !== "object" || !SRC_RE.test(img.src || "")) return null;
  return {
    src: img.src,
    pos: POS_RE.test(img.pos || "") ? img.pos : "50% 50%",
    zoom: Math.min(4, Math.max(1, Math.round((Number(img.zoom) || 1) * 100) / 100)),
    alt: str(img.alt, 200)
  };
}
function cleanImages(list) {
  return (Array.isArray(list) ? list : []).map(cleanImage).filter(Boolean).slice(0, 12);
}
function cleanEntry(e, categories) {
  return {
    title: str(e.title, 120),
    text: str(e.text, 20000),
    images: cleanImages(e.images),
    figure: cleanImage(e.figure)
  };
}
function cleanContent(input) {
  const c = input && typeof input === "object" ? input : {};
  const s = c.site || {};
  const categories = (Array.isArray(s.categories) ? s.categories : [])
    .map(x => str(x, 20)).filter(Boolean).slice(0, 12);
  const usedIds = new Set();
  const items = (Array.isArray(c.items) ? c.items : []).slice(0, 500).map(it => {
    let id = /^[a-z0-9-]{4,40}$/.test(it.id || "") && !usedIds.has(it.id) ? it.id : crypto.randomBytes(5).toString("hex");
    usedIds.add(id);
    return {
      id,
      ...cleanEntry(it),
      tag: str(it.tag, 20),
      summary: str(it.summary, 200),
      published: it.published !== false
    };
  });
  const about = cleanEntry(c.about || {});
  about.tag = str((c.about || {}).tag, 20) || "關於";
  return {
    site: {
      name: str(s.name, 60) || "留白教室 White Space",
      tagline: str(s.tagline, 120),
      description: str(s.description, 300),
      footer: str(s.footer, 200),
      bannerColor: colorOf(s.bannerColor),
      menu: cleanMenu(s.menu),
      categories
    },
    about,
    items
  };
}

async function loadContent() { return cleanContent(await store.readContent()); }
async function saveContent(next) { await store.writeContent(next); }
async function publicContent() {
  const c = await loadContent();
  c.items = c.items.filter(i => i.published);
  return c;
}

/* ---------------- 上傳 ---------------- */
const MAGIC = [
  { ext: "jpg", test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", test: b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "gif", test: b => b.slice(0, 4).toString("ascii") === "GIF8" },
  { ext: "webp", test: b => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP" },
  { ext: "avif", test: b => b.slice(4, 12).toString("ascii").startsWith("ftypavi") }
];
const MAX_UPLOAD_MB = ONLINE ? 4 : 10;            // Vercel 單次請求上限約 4.5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 12 }
});
const MIME = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif" };

/* ---------------- App ---------------- */
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY || process.env.VERCEL) app.set("trust proxy", 1);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

/* 首頁：把內容直接放進 HTML，手機開啟少一次請求 */
const escapeJSON = obj => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, c => (c === "\u2028" ? "\\u2028" : "\\u2029"));
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderMenu(menu) {
  return (menu || []).map(m => {
    const cjk = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(m.label) ? " menu__label--cjk" : "";
    const inner = `${icons.svg(m.icon)}<span class="menu__label${cjk}">${escapeHTML(m.label)}</span>`;
    if (!m.href) return `<span class="menu__item">${inner}</span>`;
    const ext = /^https?:/i.test(m.href) ? ' target="_blank" rel="noopener"' : "";
    return `<a class="menu__item" href="${escapeHTML(m.href)}"${ext}>${inner}</a>`;
  }).join("");
}

app.get(["/", "/index.html"], wrap(async (req, res) => {
  const tpl = fs.readFileSync(VIEW_FILE, "utf8");
  const c = await publicContent();
  const ogImg = (c.items[0] && c.items[0].images[0] && c.items[0].images[0].src) || "/assets/illust-pink.webp";
  const html = tpl
    .replace(/{{SITE_NAME}}/g, escapeHTML(c.site.name))
    .replace(/{{DESCRIPTION}}/g, escapeHTML(c.site.description || c.site.tagline))
    .replace(/{{TAGLINE}}/g, escapeHTML(c.site.tagline))
    .replace(/{{OG_IMAGE}}/g, escapeHTML(ogImg))
    .replace(/{{BANNER_COLOR}}/g, c.site.bannerColor)
    .replace(/{{BANNER_CLASS}}/g, isDark(c.site.bannerColor) ? "banner--dark" : "")
    .replace("<!--MENU-->", renderMenu(c.site.menu))
    .replace("<!--CONTENT-->", `<script>window.WS_CONTENT=${escapeJSON(c)};</script>`);
  // 線上讓 CDN 快取 10 秒，訪客多時不會每次都去讀儲存空間
  res.setHeader("Cache-Control", ONLINE ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30" : "no-cache");
  res.type("html").send(html);
}));

app.use("/assets", express.static(path.join(PUBLIC_DIR, "assets"), { maxAge: "7d" }));

/* 上傳的圖片：檔名帶亂數，內容不會變，所以可以快取一年 */
app.get("/uploads/:name", wrap(async (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return res.status(400).end();
  const f = await store.getUpload(name);
  if (!f) return res.status(404).end();
  const ext = name.split(".").pop().toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || f.contentType || "application/octet-stream");
  if (f.size) res.setHeader("Content-Length", f.size);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  f.stream.on("error", () => res.destroy());
  f.stream.pipe(res);
}));

app.use(express.static(PUBLIC_DIR, { maxAge: "1h", index: false }));

app.get("/api/content", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json(await publicContent());
}));

/* ---------- 後台 ---------- */
app.use("/admin", express.static(ADMIN_DIR, { maxAge: 0 }));

const api = express.Router();
api.use(express.json({ limit: "2mb" }));

// 寫入類請求要帶自訂標頭（搭配 SameSite=Strict 防 CSRF）
api.use((req, res, next) => {
  if (req.method !== "GET" && req.get("X-WS-Admin") !== "1") return res.status(403).json({ error: "forbidden" });
  next();
});

api.post("/login", (req, res) => {
  const ip = req.ip;
  if (tooManyFails(ip)) return res.status(429).json({ error: "嘗試太多次，請 15 分鐘後再試" });
  const auth = getAuth();
  if (!auth) return res.status(503).json({ error: "網站還沒設定後台密碼（環境變數 ADMIN_PASSWORD）" });
  if (!checkPassword(req.body && req.body.password, auth.rec)) {
    addFail(ip);
    return res.status(401).json({ error: "密碼不正確" });
  }
  loginFails.delete(ip);
  setSessionCookie(req, res, makeToken(auth.secret), SESSION_TTL);
  res.json({ ok: true });
});

api.post("/logout", (req, res) => {
  setSessionCookie(req, res, "", 0);
  res.json({ ok: true });
});

api.get("/me", (req, res) => res.json({ authed: isAuthed(req), canChangePassword: !ONLINE }));

// 以下需要登入
api.use((req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: "請先登入" })));

api.get("/content", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await loadContent());
}));

api.put("/content", wrap(async (req, res) => {
  const next = cleanContent(req.body);
  await saveContent(next);
  res.json(next);
}));

api.post("/upload", upload.array("files", 12), wrap(async (req, res) => {
  const saved = [];
  for (const f of req.files || []) {
    const kind = MAGIC.find(m => m.test(f.buffer));
    if (!kind) continue;
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${kind.ext}`;
    await store.putUpload(name, f.buffer, MIME[kind.ext]);
    saved.push({ src: `/uploads/${name}`, name: f.originalname });
  }
  if (!saved.length) return res.status(400).json({ error: "只接受 JPG / PNG / WebP / GIF / AVIF 圖片" });
  res.json({ files: saved });
}));

function usedSources(c) {
  const used = new Set();
  const add = e => { (e.images || []).forEach(i => used.add(i.src)); if (e.figure) used.add(e.figure.src); };
  add(c.about); c.items.forEach(add);
  return used;
}

api.get("/media", wrap(async (req, res) => {
  const used = usedSources(await loadContent());
  const list = (await store.listUploads())
    .filter(f => /\.(jpe?g|png|gif|webp|avif)$/i.test(f.name))
    .map(f => ({ src: `/uploads/${f.name}`, size: f.size, mtime: f.mtime, used: used.has(`/uploads/${f.name}`), deletable: !used.has(`/uploads/${f.name}`) }));
  const assetsDir = path.join(PUBLIC_DIR, "assets");
  for (const f of fs.readdirSync(assetsDir)) {
    if (!/\.(jpe?g|png|gif|webp|avif)$/i.test(f) || f === "logo.webp") continue;
    const st = fs.statSync(path.join(assetsDir, f));
    const src = `/assets/${f}`;
    list.push({ src, size: st.size, mtime: st.mtimeMs, used: used.has(src), deletable: false });
  }
  list.sort((a, b) => b.mtime - a.mtime);
  res.json(list);
}));

api.delete("/media/:name", wrap(async (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return res.status(400).json({ error: "檔名不正確" });
  if (usedSources(await loadContent()).has(`/uploads/${name}`)) return res.status(409).json({ error: "這張圖還在使用中" });
  if (!(await store.deleteUpload(name))) return res.status(404).json({ error: "找不到檔案" });
  res.json({ ok: true });
}));

api.post("/password", (req, res) => {
  if (ONLINE) return res.status(400).json({ error: "線上版的密碼請到 Vercel 專案的環境變數 ADMIN_PASSWORD 修改" });
  const { current, next } = req.body || {};
  const auth = getAuth();
  if (!checkPassword(current, auth.rec)) return res.status(401).json({ error: "目前密碼不正確" });
  if (typeof next !== "string" || next.length < 8) return res.status(400).json({ error: "新密碼至少 8 個字" });
  // 換新的簽章金鑰 → 其他裝置全部登出，目前這個重新發一張
  const rec = { ...hashPassword(next), secret: crypto.randomBytes(32).toString("hex") };
  store.writeAuth(rec);
  setSessionCookie(req, res, makeToken(rec.secret), SESSION_TTL);
  res.json({ ok: true });
});

api.get("/backup", wrap(async (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="white-space-content-${stamp}.json"`);
  res.json(await loadContent());
}));

app.use("/api/admin", api);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? `單張圖片不能超過 ${MAX_UPLOAD_MB}MB` : "上傳失敗";
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: "伺服器發生錯誤" });
});

app.use((req, res) => res.status(404).type("text").send("找不到頁面"));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`留白教室已啟動：http://localhost:${PORT}`);
    console.log(`後台：          http://localhost:${PORT}/admin/`);
  });
}
