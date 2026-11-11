(() => {
  const items = window.WS_ITEMS || [];
  const about = window.WS_ABOUT;

  const grid = document.getElementById("grid");
  const modal = document.getElementById("modal");
  const heroImg = document.getElementById("modal-hero");
  const thumbs = document.getElementById("modal-thumbs");
  const tagEl = document.getElementById("modal-tag");
  const titleEl = document.getElementById("modal-title");
  const figure = document.getElementById("modal-figure");
  const textEl = document.getElementById("modal-text");
  const nextBtn = modal.querySelector("[data-next]");
  const toTop = document.querySelector(".to-top");

  let filter = "all";
  let visible = items;          // 目前分類下看得到的卡片
  let current = -1;             // 目前打開的是 visible 裡第幾張；-1 = 關於
  let opener = null;            // 關閉後焦點回到原本的按鈕

  /* 把圖片設定（位置 / 色調）套到 <img> */
  function applyImage(img, data, { lazy = false } = {}) {
    img.src = data.src;
    img.alt = data.alt || "";
    const pos = data.pos || "50% 50%";
    img.style.objectPosition = pos;
    img.style.transformOrigin = pos;
    img.className = img.className.replace(/\btone-\S+/g, "").trim();
    if (data.tone) img.classList.add("tone-" + data.tone);
    if (lazy) { img.loading = "lazy"; img.decoding = "async"; }
  }

  /* ---------- 卡片 ---------- */
  function render() {
    visible = filter === "all" ? items : items.filter(i => i.tag === filter);
    grid.innerHTML = "";
    visible.forEach((item, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = `${i * 60}ms`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.addEventListener("click", () => open(i, btn));

      const media = document.createElement("span");
      media.className = "card__media";
      const img = document.createElement("img");
      img.width = 400; img.height = 300;
      applyImage(img, item.images[0], { lazy: true });
      img.alt = "";                                   // 標題已經說明了，縮圖當裝飾
      const tag = document.createElement("span");
      tag.className = "card__tag";
      tag.textContent = item.tag;
      media.append(img, tag);

      const title = document.createElement("span");
      title.className = "card__title";
      title.textContent = item.title;

      const summary = document.createElement("span");
      summary.className = "card__summary";
      summary.textContent = item.summary;

      btn.append(media, title, summary);
      li.append(btn);
      grid.append(li);
    });
  }

  document.querySelectorAll(".filter").forEach(btn => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll(".filter").forEach(b => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      render();
    });
  });

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
    tagEl.textContent = item.tag;
    titleEl.textContent = item.title;

    heroImg.removeAttribute("src");
    thumbs.innerHTML = "";
    if (item.images.length > 1) {
      item.images.forEach((im, i) => {
        const t = document.createElement("button");
        t.type = "button";
        t.className = "thumb";
        t.setAttribute("aria-label", `第 ${i + 1} 張圖`);
        const ti = document.createElement("img");
        applyImage(ti, im);
        ti.alt = "";
        t.append(ti);
        t.addEventListener("click", () => showImage(item.images, i));
        thumbs.append(t);
      });
    }
    showImage(item.images, 0);

    if (item.figure) {
      figure.hidden = false;
      applyImage(figure.querySelector("img"), item.figure);
    } else figure.hidden = true;

    textEl.innerHTML = "";
    item.text.forEach(p => {
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

  function close() { modal.close(); }

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

  // 點視窗外面（遮罩）就關閉
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  // 鍵盤：← → 換篇（Esc 關閉是 <dialog> 內建）
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

  document.querySelector("[data-open-about]").addEventListener("click", e => open(-1, e.currentTarget));

  /* ---------- 回到頂端 ---------- */
  const onScroll = () => toTop.classList.toggle("is-visible", window.scrollY > 400);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0 });
    document.querySelector(".about-btn").focus({ preventScroll: true });
  });

  document.getElementById("year").textContent = new Date().getFullYear();
  render();
})();
