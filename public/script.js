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
  const hero = document.getElementById("modal-hero");
  const slidesEl = hero.querySelector(".modal__slides");
  const dotsEl = hero.querySelector(".modal__dots");
  const tagEl = document.getElementById("modal-tag");
  const titleEl = document.getElementById("modal-title");
  const textEl = document.getElementById("modal-text");
  const secsEl = document.getElementById("modal-sections");
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
      if (item.summary) {                                  // 卡片只顯示簡介，不顯示分類
        const summary = document.createElement("span");
        summary.className = "card__summary";
        summary.textContent = item.summary;
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

    /* 上方大圖：完整顯示原圖比例；有多張就輪流播放 */
    setSlides(item.images || []);

    /* 內文（結尾的小青蛙和分類連結是固定的，寫在 HTML 裡） */
    textEl.innerHTML = "";
    textEl.append(...paragraphs(item.text).map(t => { const p = document.createElement("p"); p.textContent = t; return p; }));

    /* 內容區塊：有圖的區塊左右交錯（圖左文右 → 文左圖右 …），沒圖的就是整段文字 */
    secsEl.innerHTML = "";
    let flip = false;
    (item.sections || []).forEach(sec => {
      const box = document.createElement("section");
      box.className = "modal__sec";
      if (sec.image) {
        box.classList.add("modal__sec--img");
        if (flip) box.classList.add("modal__sec--flip");
        flip = !flip;
        const fig = document.createElement("figure");
        const img = document.createElement("img");
        img.src = sec.image.src; img.alt = sec.image.alt || "";
        if (sec.image.w) { img.width = sec.image.w; img.height = sec.image.h; }   // 先留好原圖比例的位置
        fig.append(img); box.append(fig);
      }
      const tx = document.createElement("div");
      tx.className = "modal__sec-text";
      tx.append(...paragraphs(sec.text).map(t => { const p = document.createElement("p"); p.textContent = t; return p; }));
      if (sec.text) box.append(tx);
      secsEl.append(box);
    });

    scroller.scrollTop = 0;
  }

  /* ---------- 大圖輪播 ---------- */
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let slide = 0, timer = null;
  const slideMs = (Number(site.slideSeconds) || 1.5) * 1000;                    // 間隔在後台「網站設定」調整
  slidesEl.style.setProperty("--fade", `${Math.min(900, slideMs * 0.4)}ms`);   // 間隔短時淡入淡出也跟著變快
  function showSlide(n) {
    const imgs = slidesEl.children;
    if (!imgs.length) return;
    slide = (n + imgs.length) % imgs.length;
    [...imgs].forEach((im, i) => { im.classList.toggle("is-on", i === slide); im.setAttribute("aria-hidden", i !== slide); });
    [...dotsEl.children].forEach((d, i) => d.setAttribute("aria-current", i === slide));
  }
  function stopAuto() { clearInterval(timer); timer = null; }
  function startAuto() {
    stopAuto();
    if (!reduceMotion && slidesEl.children.length > 1) timer = setInterval(() => showSlide(slide + 1), slideMs);
  }
  function setSlides(imgs) {
    stopAuto();
    slidesEl.innerHTML = ""; dotsEl.innerHTML = "";
    hero.hidden = !imgs.length;
    imgs.forEach((d, i) => {
      const img = document.createElement("img");
      img.src = d.src; img.alt = d.alt || ""; img.decoding = "async";
      if (d.w) { img.width = d.w; img.height = d.h; }
      slidesEl.append(img);
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `第 ${i + 1} 張圖`);
      dot.addEventListener("click", () => { showSlide(i); startAuto(); });
      dotsEl.append(dot);
    });
    dotsEl.hidden = imgs.length < 2;
    showSlide(0);
    startAuto();
  }
  // 大圖上左右滑動：換圖（不換篇）
  let hx = null, hy = null;
  hero.addEventListener("touchstart", e => { hx = e.touches[0].clientX; hy = e.touches[0].clientY; }, { passive: true });
  hero.addEventListener("touchend", e => {
    if (hx === null || slidesEl.children.length < 2) return;
    const dx = e.changedTouches[0].clientX - hx, dy = e.changedTouches[0].clientY - hy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.stopPropagation(); showSlide(slide + (dx < 0 ? 1 : -1)); startAuto(); }
    hx = hy = null;
  });

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
    if (linksEl.children.length === 2) linksEl.append(Object.assign(document.createElement("i"), { className: "modal__br" }));   // 手機版在這裡換行
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
    stopAuto();
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

  // 左右滑動不換篇（選取、複製文字時容易誤觸）；換篇用右上角按鈕

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
