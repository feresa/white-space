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
  const heroImg = document.getElementById("modal-hero");
  const moreEl = document.getElementById("modal-more");
  const tagEl = document.getElementById("modal-tag");
  const titleEl = document.getElementById("modal-title");
  const figure = document.getElementById("modal-figure");
  const textEl = document.getElementById("modal-text");
  const nextBtn = modal.querySelector("[data-next]");
  const toTop = document.querySelector(".to-top");

  let filter = "all";
  let visible = items;
  let current = -1;
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

  /* ---------- 彈出視窗 ---------- */
  function fill(item) {
    tagEl.textContent = item.tag || "";
    tagEl.hidden = !item.tag;
    titleEl.textContent = item.title;

    /* 第一張是上方滿版大圖，其餘的圖接在文字後面一張一張往下排 */
    const imgs = item.images || [];
    heroImg.removeAttribute("src");
    heroImg.parentElement.hidden = !imgs.length;
    if (imgs.length) applyImage(heroImg, imgs[0]);

    moreEl.innerHTML = "";
    imgs.slice(1).forEach(im => {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      applyImage(img, im, { lazy: true });
      img.style.transform = "none";            // 內文裡的圖直接顯示完整比例
      img.style.objectFit = "contain";
      fig.append(img);
      moreEl.append(fig);
    });

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
    fill(visible[idx]);
    nextBtn.hidden = visible.length < 2;
    if (!modal.open) {
      opener = trigger || null;
      modal.showModal();
      document.body.classList.add("modal-open");
    }
  }

  const close = () => modal.close();
  function next(step = 1) {
    if (visible.length < 2) return;
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

  /* ---------- 回到頂端 ---------- */
  const onScroll = () => toTop.classList.toggle("is-visible", window.scrollY > 400);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0 });
    document.getElementById("top").focus({ preventScroll: true });
  });

  render();
})();
