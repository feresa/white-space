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
  const moreEl = document.getElementById("modal-more");
  const tagEl = document.getElementById("modal-tag");
  const titleEl = document.getElementById("modal-title");
  const textEl = document.getElementById("modal-text");
  const prevBtn = modal.querySelector("[data-prev]");
  const nextBtn = modal.querySelector("[data-next]");
  const shareBtn = modal.querySelector("[data-share]");
  const toastEl = document.getElementById("modal-toast");
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

    /* 第一張是上方大圖（完整顯示原圖比例），其餘的圖接在文字後面一張一張往下排 */
    const imgs = item.images || [];
    heroImg.removeAttribute("src");
    heroImg.parentElement.hidden = !imgs.length;
    if (imgs.length) { heroImg.src = imgs[0].src; heroImg.alt = imgs[0].alt || ""; }

    /* 內文；結尾固定放留白教室的小青蛙（在最後一段旁邊），後面不再放其他圖 */
    textEl.innerHTML = "";
    const ps = paragraphs(item.text).map(t => { const p = document.createElement("p"); p.textContent = t; return p; });
    const frog = document.createElement("img");
    frog.className = "modal__frog";
    frog.src = "/assets/frog-end.png";
    frog.alt = "";
    frog.width = 114; frog.height = 138;
    const row = document.createElement("div");
    row.className = "modal__last";
    if (ps.length) { textEl.append(...ps.slice(0, -1)); row.append(ps[ps.length - 1]); }
    row.append(frog);
    textEl.append(row);
    moreEl.innerHTML = "";

    scroller.scrollTop = 0;
  }

  /* 每篇文章有自己的網址：…#p=<id>（分享用） */
  const linkOf = item => `${location.origin}${location.pathname}#p=${encodeURIComponent(item.id)}`;
  const setHash = h => history.replaceState(null, "", location.pathname + location.search + h);

  function open(idx, trigger) {
    current = idx;
    const item = visible[idx];
    fill(item);
    const single = visible.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;
    if (item.id) setHash(`#p=${encodeURIComponent(item.id)}`);
    if (!modal.open) {
      opener = trigger || null;
      modal.showModal();
      scroller.focus({ preventScroll: true });          // 焦點放在文章本身，不要讓第一顆按鈕出現焦點框
      document.body.classList.add("modal-open");
    }
  }

  const close = () => modal.close();
  function step(d) {
    if (current < 0 || visible.length < 2) return;
    open((current + d + visible.length) % visible.length);
  }

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 2200);
  }
  async function share() {
    const item = visible[current];
    if (!item) return;
    const url = linkOf(item);
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url }); } catch { /* 使用者取消 */ }
      return;
    }
    try { await navigator.clipboard.writeText(url); toast("已複製文章連結"); }
    catch { window.prompt("複製這個連結分享：", url); }
  }

  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    if (location.hash.startsWith("#p=")) setHash("");
    current = -1;
    if (opener) opener.focus();
  });
  modal.querySelector("[data-close]").addEventListener("click", close);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  shareBtn.addEventListener("click", share);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
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
  window.addEventListener("hashchange", openFromHash);
})();
