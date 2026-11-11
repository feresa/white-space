/*
 * 留白教室 White Space｜網站 + 後台
 * ----------------------------------------------------------
 * 前台：  /          讀 data/content.json 顯示內容
 * 後台：  /admin     登入後可編輯內容、上傳圖片
 *
 * 環境變數：
 *   PORT              預設 3000
 *   ADMIN_PASSWORD    第一次啟動時的管理員密碼（之後可在後台修改）
 *   DATA_DIR          內容與上傳檔案存放位置，預設 ./data
 *   TRUST_PROXY=1     放在 Nginx / 雲端平台後面（HTTPS）時設定
 */
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const SEED_FILE = path.join(ROOT, "seed", "content.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const ADMIN_DIR = path.join(ROOT, "admin");

for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

/* ---------------- 檔案讀寫 ---------------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJSONAtomic(file, data) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

if (!fs.existsSync(CONTENT_FILE)) {
  fs.copyFileSync(SEED_FILE, CONTENT_FILE);
  console.log("已建立初始內容：", CONTENT_FILE);
}

/* ---------------- 密碼 ---------------- */
function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return { salt, hash };
}
function checkPassword(pw, auth) {
  if (!auth || typeof pw !== "string") return false;
  const h = crypto.scryptSync(pw, auth.salt, 64);
  const expected = Buffer.from(auth.hash, "hex");
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}
if (!fs.existsSync(AUTH_FILE)) {
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    pw = crypto.randomBytes(6).toString("base64url");
    console.log("\n==============================================");
    console.log("  沒有設定 ADMIN_PASSWORD，已產生臨時密碼：");
    console.log("  " + pw);
    console.log("  請登入後台後立刻到「帳號」修改密碼。");
    console.log("==============================================\n");
  }
  writeJSONAtomic(AUTH_FILE, hashPassword(pw));
}

/* ---------------- Session ---------------- */
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 天
const sessions = new Map(); // token -> expires

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
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function setSessionCookie(req, res, token, maxAgeMs) {
  const parts = [
    `ws_session=${token}`, "Path=/", "HttpOnly", "SameSite=Strict",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (req.secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/* 登入失敗次數限制：每個 IP 15 分鐘內最多 8 次 */
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
      categories
    },
    about,
    items
  };
}

function loadContent() { return cleanContent(readJSON(CONTENT_FILE, readJSON(SEED_FILE, {}))); }

function saveContent(next) {
  // 每次儲存前先備份，保留最近 30 份
  if (fs.existsSync(CONTENT_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(CONTENT_FILE, path.join(BACKUP_DIR, `content-${stamp}.json`));
    const old = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json")).sort();
    old.slice(0, Math.max(0, old.length - 30)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  }
  writeJSONAtomic(CONTENT_FILE, next);
}

function publicContent() {
  const c = loadContent();
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 12 }
});

/* ---------------- App ---------------- */
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

/* 首頁：把內容直接放進 HTML，手機開啟少一次請求 */
const escapeJSON = obj => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, c => (c === "\u2028" ? "\\u2028" : "\\u2029"));
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

app.get(["/", "/index.html"], (req, res) => {
  const tpl = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
  const c = publicContent();
  const ogImg = (c.items[0] && c.items[0].images[0] && c.items[0].images[0].src) || "/assets/illust-pink.webp";
  const html = tpl
    .replace(/{{SITE_NAME}}/g, escapeHTML(c.site.name))
    .replace(/{{DESCRIPTION}}/g, escapeHTML(c.site.description || c.site.tagline))
    .replace(/{{TAGLINE}}/g, escapeHTML(c.site.tagline))
    .replace(/{{OG_IMAGE}}/g, escapeHTML(ogImg))
    .replace(/{{BANNER_COLOR}}/g, c.site.bannerColor)
    .replace(/{{BANNER_CLASS}}/g, isDark(c.site.bannerColor) ? "banner--dark" : "")
    .replace("<!--CONTENT-->", `<script>window.WS_CONTENT=${escapeJSON(c)};</script>`);
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(html);
});

app.use("/assets", express.static(path.join(PUBLIC_DIR, "assets"), { maxAge: "7d" }));
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "365d", immutable: true }));
app.use(express.static(PUBLIC_DIR, { maxAge: "1h", index: false }));

app.get("/api/content", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json(publicContent());
});

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
  if (!checkPassword(req.body && req.body.password, readJSON(AUTH_FILE))) {
    addFail(ip);
    return res.status(401).json({ error: "密碼不正確" });
  }
  loginFails.delete(ip);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL);
  setSessionCookie(req, res, token, SESSION_TTL);
  res.json({ ok: true });
});

api.post("/logout", (req, res) => {
  sessions.delete(parseCookies(req).ws_session);
  setSessionCookie(req, res, "", 0);
  res.json({ ok: true });
});

api.get("/me", (req, res) => res.json({ authed: isAuthed(req) }));

// 以下需要登入
api.use((req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: "請先登入" })));

api.get("/content", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(loadContent());
});

api.put("/content", (req, res) => {
  const next = cleanContent(req.body);
  saveContent(next);
  res.json(next);
});

api.post("/upload", upload.array("files", 12), (req, res) => {
  const saved = [];
  for (const f of req.files || []) {
    const kind = MAGIC.find(m => m.test(f.buffer));
    if (!kind) continue;
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${kind.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), f.buffer);
    saved.push({ src: `/uploads/${name}`, name: f.originalname });
  }
  if (!saved.length) return res.status(400).json({ error: "只接受 JPG / PNG / WebP / GIF / AVIF 圖片" });
  res.json({ files: saved });
});

function usedSources(c) {
  const used = new Set();
  const add = e => { (e.images || []).forEach(i => used.add(i.src)); if (e.figure) used.add(e.figure.src); };
  add(c.about); c.items.forEach(add);
  return used;
}

api.get("/media", (req, res) => {
  const used = usedSources(loadContent());
  const list = [];
  const scan = (dir, prefix, deletable) => {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(jpe?g|png|gif|webp|avif)$/i.test(f) || f === "logo.webp") continue;
      const st = fs.statSync(path.join(dir, f));
      const src = `${prefix}/${f}`;
      list.push({ src, size: st.size, mtime: st.mtimeMs, used: used.has(src), deletable: deletable && !used.has(src) });
    }
  };
  scan(UPLOAD_DIR, "/uploads", true);
  scan(path.join(PUBLIC_DIR, "assets"), "/assets", false);
  list.sort((a, b) => b.mtime - a.mtime);
  res.json(list);
});

api.delete("/media/:name", (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return res.status(400).json({ error: "檔名不正確" });
  const src = `/uploads/${name}`;
  if (usedSources(loadContent()).has(src)) return res.status(409).json({ error: "這張圖還在使用中" });
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "找不到檔案" });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

api.post("/password", (req, res) => {
  const { current, next } = req.body || {};
  if (!checkPassword(current, readJSON(AUTH_FILE))) return res.status(401).json({ error: "目前密碼不正確" });
  if (typeof next !== "string" || next.length < 8) return res.status(400).json({ error: "新密碼至少 8 個字" });
  writeJSONAtomic(AUTH_FILE, hashPassword(next));
  // 其他裝置登出，保留目前這個
  const mine = parseCookies(req).ws_session;
  for (const t of sessions.keys()) if (t !== mine) sessions.delete(t);
  res.json({ ok: true });
});

api.get("/backup", (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="white-space-content-${stamp}.json"`);
  res.json(loadContent());
});

app.use("/api/admin", api);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "單張圖片不能超過 10MB" : "上傳失敗";
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: "伺服器發生錯誤" });
});

app.use((req, res) => res.status(404).type("text").send("找不到頁面"));

app.listen(PORT, () => {
  console.log(`留白教室已啟動：http://localhost:${PORT}`);
  console.log(`後台：          http://localhost:${PORT}/admin/`);
});
