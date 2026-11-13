/*
 * 儲存層：同一組介面，兩種實作
 *   本機（預設）  資料放在 DATA_DIR（預設 ./data）
 *   線上（Vercel）設定了 BLOB_READ_WRITE_TOKEN 就改用 Vercel Blob（私有儲存）
 *
 * 內容：content.json　　圖片：uploads/<檔名>　　備份：backups/content-<時間>.json
 */
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const ROOT = __dirname;
const SEED_FILE = path.join(ROOT, "seed", "content.json");
const BACKUP_KEEP = 30;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const seed = () => JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

/* ================= 本機檔案 ================= */
function localStore() {
  const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
  const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
  const BACKUP_DIR = path.join(DATA_DIR, "backups");
  const CONTENT_FILE = path.join(DATA_DIR, "content.json");
  for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.copyFileSync(SEED_FILE, CONTENT_FILE);
    console.log("已建立初始內容：", CONTENT_FILE);
  }

  const writeAtomic = (file, text) => {
    const tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  };

  return {
    mode: "local",
    dataDir: DATA_DIR,
    async readContent() {
      try { return JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8")); } catch { return seed(); }
    },
    async writeContent(obj) {
      if (fs.existsSync(CONTENT_FILE)) {
        fs.copyFileSync(CONTENT_FILE, path.join(BACKUP_DIR, `content-${stamp()}.json`));
        const old = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json")).sort();
        old.slice(0, Math.max(0, old.length - BACKUP_KEEP)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
      }
      writeAtomic(CONTENT_FILE, JSON.stringify(obj, null, 2));
    },
    async putUpload(name, buffer) { fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer); },
    async getUpload(name) {
      const file = path.join(UPLOAD_DIR, name);
      if (!fs.existsSync(file)) return null;
      return { stream: fs.createReadStream(file), size: fs.statSync(file).size };
    },
    async listUploads() {
      return fs.readdirSync(UPLOAD_DIR).map(name => {
        const st = fs.statSync(path.join(UPLOAD_DIR, name));
        return { name, size: st.size, mtime: st.mtimeMs };
      });
    },
    async deleteUpload(name) {
      const file = path.join(UPLOAD_DIR, name);
      if (!fs.existsSync(file)) return false;
      fs.unlinkSync(file);
      return true;
    },
    /* 本機模式的登入資料 */
    readAuth() { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "auth.json"), "utf8")); } catch { return null; } },
    writeAuth(obj) { writeAtomic(path.join(DATA_DIR, "auth.json"), JSON.stringify(obj, null, 2)); }
  };
}

/* ================= Vercel Blob ================= */
function blobStore() {
  const blob = require("@vercel/blob");
  const CONTENT_KEY = "content.json";
  const CONTENT_TTL = 3000; // 同一個執行個體內快取 3 秒，減少讀取次數
  let cache = null, cacheAt = 0;

  const toNodeStream = web => Readable.fromWeb(web);

  return {
    mode: "blob",
    async readContent() {
      if (cache && Date.now() - cacheAt < CONTENT_TTL) return cache;
      const r = await blob.get(CONTENT_KEY, { access: "private", useCache: false });
      let data;
      if (!r || r.statusCode !== 200) data = seed();
      else data = JSON.parse(await new Response(r.stream).text());
      cache = data; cacheAt = Date.now();
      return data;
    },
    async writeContent(obj) {
      // 先把舊版本備份
      try {
        const old = await blob.get(CONTENT_KEY, { access: "private", useCache: false });
        if (old && old.statusCode === 200) {
          await blob.put(`backups/content-${stamp()}.json`, await new Response(old.stream).text(), {
            access: "private", addRandomSuffix: false, contentType: "application/json"
          });
          const all = [];
          let cursor;
          do {
            const page = await blob.list({ prefix: "backups/", cursor });
            all.push(...page.blobs);
            cursor = page.hasMore ? page.cursor : undefined;
          } while (cursor);
          all.sort((a, b) => a.pathname.localeCompare(b.pathname));
          const stale = all.slice(0, Math.max(0, all.length - BACKUP_KEEP)).map(b => b.url);
          if (stale.length) await blob.del(stale);
        }
      } catch (e) { console.error("備份失敗（不影響儲存）：", e.message); }

      await blob.put(CONTENT_KEY, JSON.stringify(obj, null, 2), {
        access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
      });
      cache = obj; cacheAt = Date.now();
    },
    async putUpload(name, buffer, contentType) {
      await blob.put(`uploads/${name}`, buffer, { access: "private", addRandomSuffix: false, contentType });
    },
    async getUpload(name) {
      const r = await blob.get(`uploads/${name}`, { access: "private" });
      if (!r || r.statusCode !== 200) return null;
      return { stream: toNodeStream(r.stream), size: r.blob.size, contentType: r.blob.contentType };
    },
    async listUploads() {
      const out = [];
      let cursor;
      do {
        const page = await blob.list({ prefix: "uploads/", cursor });
        for (const b of page.blobs) out.push({ name: b.pathname.slice("uploads/".length), size: b.size, mtime: new Date(b.uploadedAt).getTime() });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },
    async deleteUpload(name) {
      const r = await blob.head(`uploads/${name}`).catch(() => null);
      if (!r) return false;
      await blob.del(r.url);
      return true;
    },
    readAuth() { return null; },
    writeAuth() { throw new Error("線上版的密碼由環境變數 ADMIN_PASSWORD 控制"); }
  };
}

module.exports = useBlob ? blobStore() : localStore();
