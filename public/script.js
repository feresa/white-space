(async () => {
  /* 內容由伺服器放進 window.WS_CONTENT；沒有的話再去 API 拿 */
  let data = window.WS_CONTENT;
  if (!data) {
    try { data = await (await fetch("/api/content")).json(); }
    catch { data = { site: {}, items: [] }; }
  }
  const site = data.site || {};
  const items = data.items || [];

  const grid = document.getElementById("grid");
  const modal = document.getElementById("modal");
  const scroller = modal.querySelector(".modal__scroll");
  const heroImg = document.getElementById("modal-hero");
  const tagEl = document.getElementById("modal-tag");
  const titleEl = document.getElementById("modal-title");
  const textEl = document.getElementById("modal-text");
  const nextBtn = modal.querySelector("[data-next]");
  const linksEl = document.getElementById("modal-links");
  const toTop = document.querySelector(".to-top");

  let visible = items;
  let current = -1;
  let opener = null;

  document.getElementById("footer-text").textContent = site.footer || "";
  document.getElementById("modal-footer").textContent = site.footer || "";

  /* 放大時讓焦點盡量落在畫面正中央（邊緣不留白） */
  function zoomOrigin(pos, zoom) {
    const z = Number(zoom) || 1;
    const [x, y] = String(pos || "50% 50%").split(" ").map(parseFloat);
    const f = v => (z > 1 ? Math.min(100, Math.max(0, (z * v - 50) / (z - 1))) : v);
    return `${f(x)}% ${f(y)}%`;
  }

  /* 圖片：src / 焦點位置 / 替代文字 */
  function applyImage(img, d, { lazy = false } = {}) {
    if (!d) return;
    img.src = d.src;
    img.alt = d.alt || "";
    img.style.objectPosition = d.pos || "50% 50%";
    img.style.transformOrigin = zoomOrigin(d.pos, d.zoom);
    img.style.setProperty("--z", d.zoom || 1);
    if (lazy) { img.loading = "lazy"; img.decoding = "async"; }
  }

  const paragraphs = text => String(text || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  /* ---------- 卡片 ---------- */
  function render() {
    grid.innerHTML = "";
    if (!visible.length) {
      const li = document.createElement("li");
      li.className = "grid__empty";
      li.textContent = "這裡還是一片留白。";
      grid.append(li);
      return;
    }
    visible.forEach((item, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = `${Math.min(i, 8) * 60}ms`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.addEventListener("click", () => open(i, btn));

      const media = document.createElement("span");
      media.className = "card__media";
      if (item.images[0]) {
        const img = document.createElement("img");
        img.width = 400; img.height = 300;
        applyImage(img, item.images[0], { lazy: i > 2 });
        img.alt = "";
        media.append(img);
      }
      const title = document.createElement("span");
      title.className = "card__title";
      title.textContent = item.title;

      btn.append(media, title);
      const meta = [item.tag, item.summary].filter(Boolean).join(" · ");
      if (meta) {
        const summary = document.createElement("span");
        summary.className = "card__summary";
        summary.textContent = meta;
        btn.append(summary);
      }
      li.append(btn);
      grid.append(li);
    });
  }

  /* ---------- 文章視窗 ---------- */
  function fill(item) {
    tagEl.textContent = item.tag || "";
    tagEl.hidden = !item.tag;
    titleEl.textContent = item.title;

    /* 只用第一張圖：上方大圖，完整顯示原圖比例 */
    const imgs = item.images || [];
    heroImg.removeAttribute("src");
    heroImg.parentElement.hidden = !imgs.length;
    if (imgs.length) { heroImg.src = imgs[0].src; heroImg.alt = imgs[0].alt || ""; }

    /* 內文（結尾的小青蛙和分類連結是固定的，寫在 HTML 裡） */
    textEl.innerHTML = "";
    textEl.append(...paragraphs(item.text).map(t => { const p = document.createElement("p"); p.textContent = t; return p; }));

    scroller.scrollTop = 0;
  }

  /* 結尾的分類連結（用選單設定；文字用中文名稱） */
  const slugOf = name => String(name).trim().toLowerCase().replace(/\s+/g, "-");
  (site.menu || []).forEach(m => {
    const href = m.category ? `/c/${encodeURIComponent(slugOf(m.category))}` : m.href;
    const el = document.createElement(href ? "a" : "span");
    el.textContent = m.labelZh || m.label;
    if (href) {
      el.href = href;
      if (/^https?:/i.test(href)) { el.target = "_blank"; el.rel = "noopener"; }
    }
    linksEl.append(el);
  });

  /* 每篇文章有自己的網址：…#p=<id>。用瀏覽器的分享就會分享這一篇；
     打開文章時多記一筆瀏覽紀錄，手機按瀏覽器的「返回」會關閉文章，而不是離開網站 */
  const setHash = h => history.replaceState(history.state, "", location.pathname + location.search + h);
  let pushed = false;

  function open(idx, trigger) {
    current = idx;
    const item = visible[idx];
    fill(item);
    nextBtn.hidden = visible.length < 2;
    const hash = item.id ? `#p=${encodeURIComponent(item.id)}` : "";
    if (!modal.open) {
      opener = trigger || null;
      if (trigger && hash) { history.pushState({ wsArticle: true }, "", location.pathname + location.search + hash); pushed = true; }
      else if (hash) setHash(hash);
      modal.showModal();
      document.body.classList.add("modal-open");
      scroller.focus({ preventScroll: true });          // 焦點放在文章本身，按鈕不出現焦點框
    } else if (hash) setHash(hash);
  }

  const close = () => modal.close();
  function step(d) {
    if (current < 0 || visible.length < 2) return;
    open((current + d + visible.length) % visible.length);
  }

  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    current = -1;
    if (pushed) { pushed = false; history.back(); }      // 收回打開時多記的那一筆
    else if (location.hash.startsWith("#p=")) setHash("");
    if (opener) opener.focus();
  });
  window.addEventListener("popstate", () => {
    if (modal.open && !location.hash.startsWith("#p=")) { pushed = false; modal.close(); }   // 手機按「返回」
    else if (!modal.open) openFromHash();
  });
  modal.querySelector("[data-close]").addEventListener("click", close);
  nextBtn.addEventListener("click", () => step(1));
  modal.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });

  // 手機：左右滑動換篇
  let sx = null, sy = null;
  modal.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  modal.addEventListener("touchend", e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    sx = sy = null;
  });

  /* ---------- 回到頂端 ---------- */
  const onScroll = () => toTop.classList.toggle("is-visible", window.scrollY > 400);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0 });
    document.getElementById("top").focus({ preventScroll: true });
  });

  render();

  /* 打開分享連結：網址帶 #p=<id> 就直接打開那篇 */
  function openFromHash() {
    const m = /^#p=(.+)$/.exec(location.hash);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    const idx = visible.findIndex(i => i.id === id);
    if (idx >= 0) open(idx);
  }
  openFromHash();
})();
