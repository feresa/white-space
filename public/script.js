(async () => {
  /* 內容由伺服器放進 window.WS_CONTENT；沒有的話再去 API 拿 */
  let data = window.WS_CONTENT;
  if (!data) {
    try { data = await (await fetch("/api/content")).json(); }
    catch { data = { site: {}, about: null, items: [] }; }
  }
  const site = data.site || {};
  const items = data.items || [];
  const about = data.about;

  const grid = document.getElementById("grid");
  const filtersEl = document.getElementById("filters");
  const modal = document.getElementById("modal");
  const heroImg = document.getElementById("modal-hero");
  const thumbs = document.getElementById("modal-thumbs");
  const tagEl = document.getElementById("modal-tag");
  const titleEl = document.getElementById("modal-title");
  const figure = document.getElementById("modal-figure");
  const textEl = document.getElementById("modal-text");
  const nextBtn = modal.querySelector("[data-next]");
  const toTop = document.querySelector(".to-top");
  const aboutBtn = document.querySelector("[data-open-about]");

  let filter = "all";
  let visible = items;
  let current = -1;            // -1 = 關於
  let opener = null;

  document.getElementById("footer-text").textContent = site.footer || "";

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

  /* ---------- 分類按鈕 ---------- */
  function buildFilters() {
    const cats = (site.categories || []).filter(c => items.some(i => i.tag === c));
    if (!cats.length) { filtersEl.hidden = true; return; }
    ["all", ...cats].forEach(c => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter" + (c === filter ? " is-active" : "");
      b.dataset.filter = c;
      b.textContent = c === "all" ? "全部" : c;
      b.setAttribute("aria-pressed", String(c === filter));
      b.addEventListener("click", () => {
        filter = c;
        filtersEl.querySelectorAll(".filter").forEach(x => {
          const on = x === b;
          x.classList.toggle("is-active", on);
          x.setAttribute("aria-pressed", String(on));
        });
        render();
      });
      filtersEl.append(b);
    });
  }

  /* ---------- 卡片 ---------- */
  function render() {
    visible = filter === "all" ? items : items.filter(i => i.tag === filter);
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
      if (item.tag) {
        const tag = document.createElement("span");
        tag.className = "card__tag";
        tag.textContent = item.tag;
        media.append(tag);
      }

      const title = document.createElement("span");
      title.className = "card__title";
      title.textContent = item.title;

      btn.append(media, title);
      if (item.summary) {
        const summary = document.createElement("span");
        summary.className = "card__summary";
        summary.textContent = item.summary;
        btn.append(summary);
      }
      li.append(btn);
      grid.append(li);
    });
  }

  /* ---------- 彈出視窗 ---------- */
  function showImage(list, idx) {
    const swap = () => applyImage(heroImg, list[idx]);
    if (heroImg.getAttribute("src")) {
      heroImg.classList.add("is-fading");
      setTimeout(() => { swap(); heroImg.classList.remove("is-fading"); }, 180);
    } else swap();
    [...thumbs.children].forEach((t, i) => t.setAttribute("aria-current", String(i === idx)));
  }

  function fill(item) {
    tagEl.textContent = item.tag || "";
    tagEl.hidden = !item.tag;
    titleEl.textContent = item.title;

    const imgs = item.images || [];
    heroImg.removeAttribute("src");
    heroImg.parentElement.hidden = !imgs.length;
    thumbs.innerHTML = "";
    thumbs.hidden = imgs.length < 2;
    if (imgs.length > 1) {
      imgs.forEach((im, i) => {
        const t = document.createElement("button");
        t.type = "button";
        t.className = "thumb";
        t.setAttribute("aria-label", `第 ${i + 1} 張圖`);
        const ti = document.createElement("img");
        applyImage(ti, im);
        ti.alt = "";
        t.append(ti);
        t.addEventListener("click", () => showImage(imgs, i));
        thumbs.append(t);
      });
    }
    if (imgs.length) showImage(imgs, 0);

    if (item.figure) {
      figure.hidden = false;
      applyImage(figure.querySelector("img"), item.figure);
    } else figure.hidden = true;

    textEl.innerHTML = "";
    paragraphs(item.text).forEach(p => {
      const el = document.createElement("p");
      el.textContent = p;
      textEl.append(el);
    });

    modal.querySelector(".modal__scroll").scrollTop = 0;
  }

  function open(idx, trigger) {
    current = idx;
    fill(idx === -1 ? about : visible[idx]);
    nextBtn.hidden = idx === -1 || visible.length < 2;
    if (!modal.open) {
      opener = trigger || null;
      modal.showModal();
      document.body.classList.add("modal-open");
    }
  }

  const close = () => modal.close();
  function next(step = 1) {
    if (current < 0 || visible.length < 2) return;
    open((current + step + visible.length) % visible.length);
  }

  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    if (opener) opener.focus();
  });
  modal.querySelector("[data-close]").addEventListener("click", close);
  nextBtn.addEventListener("click", () => next(1));
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  modal.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") next(1);
    if (e.key === "ArrowLeft") next(-1);
  });

  // 手機：左右滑動換篇
  let sx = null, sy = null;
  modal.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  modal.addEventListener("touchend", e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) next(dx < 0 ? 1 : -1);
    sx = sy = null;
  });

  if (about && about.title) aboutBtn.addEventListener("click", e => open(-1, e.currentTarget));
  else aboutBtn.hidden = true;

  /* ---------- 回到頂端 ---------- */
  const onScroll = () => toTop.classList.toggle("is-visible", window.scrollY > 400);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0 });
    aboutBtn.focus({ preventScroll: true });
  });

  buildFilters();
  render();
})();
