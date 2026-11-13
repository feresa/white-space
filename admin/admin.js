/* 留白教室｜後台 */
(() => {
  const $ = s => document.querySelector(s);
  const view = $("#view");

  let doc = null;          // 正在編輯的內容
  let savedJSON = "";      // 上次儲存的版本
  let editing = null;      // 正在編輯的卡片 id
  let canChangePassword = true;

  /* ---------- 小工具 ---------- */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
    return el;
  }
  const icon = d => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "18"); s.setAttribute("height", "18");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    return s;
  };
  const I = {
    up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6",
    left: "M19 12H5M11 6l-6 6 6 6", right: "M5 12h14M13 6l6 6-6 6",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13", back: "M15 6l-6 6 6 6"
  };

  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("is-error", isError);
    t.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-show"), isError ? 4000 : 2200);
  }

  async function api(path, opts = {}) {
    const res = await fetch("/api/admin" + path, {
      credentials: "same-origin",
      ...opts,
      headers: { "X-WS-Admin": "1", ...(opts.json ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) },
      body: opts.json ? JSON.stringify(opts.json) : opts.body
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 401 && path !== "/login" && path !== "/password") { showLogin(); throw new Error("請重新登入"); }
    if (res.status === 413) throw new Error("檔案太大，請換小一點的圖（4MB 以內）");
    if (!res.ok) throw new Error((data && data.error) || "發生錯誤");
    return data;
  }

  const uid = () => Math.random().toString(16).slice(2, 12);
  const paraCount = t => String(t || "").split(/\n\s*\n/).filter(s => s.trim()).length;

  /* ---------- 儲存狀態 ---------- */
  const isDirty = () => doc && JSON.stringify(doc) !== savedJSON;
  function changed() { $("#savebar").hidden = !isDirty(); }

  async function save() {
    const btn = $("#save");
    btn.disabled = true;
    try {
      doc = await api("/content", { method: "PUT", json: doc });
      savedJSON = JSON.stringify(doc);
      changed();
      toast("已儲存，網站已更新");
      route();
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; }
  }
  $("#save").addEventListener("click", save);
  $("#revert").addEventListener("click", () => {
    if (!confirm("確定要放棄還沒儲存的變更嗎？")) return;
    doc = JSON.parse(savedJSON);
    changed();
    route();
  });
  window.addEventListener("beforeunload", e => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (isDirty()) save(); }
  });

  /* ---------- 上傳（大圖先在瀏覽器縮小） ---------- */
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const LIMIT = 3.6 * 1024 * 1024;                 // 線上版單次請求上限約 4.5MB，留一點餘裕
    try {
      const bmp = await createImageBitmap(file);
      let max = 2400, q = 0.86;
      const scale0 = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale0 === 1 && file.size < 1.5 * 1024 * 1024) return file;
      let best = null;
      for (let i = 0; i < 4; i++) {
        const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise(r => c.toBlob(r, "image/webp", q));
        if (!blob) break;
        best = blob;
        if (blob.size <= LIMIT) break;
        max = Math.round(max * 0.8); q = Math.max(0.6, q - 0.08);
      }
      return best && best.size < file.size ? new File([best], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }) : file;
    } catch { return file; }
  }
  async function uploadFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return [];
    const out = [];
    for (let i = 0; i < files.length; i++) {            // 一張一張傳，避免超過單次請求上限
      toast(`上傳中… ${i + 1} / ${files.length}`);
      const fd = new FormData();
      fd.append("files", await shrink(files[i]));
      const r = await api("/upload", { method: "POST", body: fd });
      out.push(...r.files);
    }
    toast(`已上傳 ${out.length} 張`);
    return out.map(f => ({ src: f.src, pos: "50% 50%", zoom: 1, alt: "" }));
  }

  /* ---------- 圖庫選圖 ---------- */
  function pickImage() {
    return new Promise(async resolve => {
      const dlg = $("#picker");
      const grid = $("#picker-grid");
      const up = $("#picker-upload");
      let done = false;
      const finish = v => { if (done) return; done = true; dlg.close(); resolve(v); };
      const fill = async () => {
        grid.innerHTML = "";
        const list = await api("/media");
        list.forEach(m => grid.append(
          h("div", { class: "media" },
            h("button", { class: "media__pick", type: "button", onclick: () => finish({ src: m.src, pos: "50% 50%", zoom: 1, alt: "" }) },
              h("img", { src: m.src, alt: "", loading: "lazy" })))
        ));
      };
      up.onchange = async () => {
        try { const imgs = await uploadFiles(up.files); up.value = ""; if (imgs[0]) finish(imgs[0]); }
        catch (e) { toast(e.message, true); }
      };
      dlg.querySelector("[data-close]").onclick = () => finish(null);
      dlg.onclose = () => finish(null);
      dlg.onclick = e => { if (e.target === dlg) finish(null); };
      dlg.showModal();
      try { await fill(); } catch (e) { toast(e.message, true); }
    });
  }

  /* ---------- 圖片編輯區塊 ---------- */
  function cropPreview(img, kind) {
    const el = h("img", { src: img.src, alt: "" });
    const sync = () => {
      el.style.objectPosition = img.pos || "50% 50%";
      const z = Number(img.zoom) || 1;
      const [x, y] = String(img.pos || "50% 50%").split(" ").map(parseFloat);
      const f = v => (z > 1 ? Math.min(100, Math.max(0, (z * v - 50) / (z - 1))) : v);
      el.style.transformOrigin = `${f(x)}% ${f(y)}%`;
      el.style.setProperty("--z", img.zoom || 1);
    };
    sync();
    return { node: h("div", { class: `crop crop--${kind}` }, el), sync };
  }

  function imageEditor(img, { kind = "card", label, buttons = [] }) {
    const crop = cropPreview(img, kind);
    const dot = h("span", { class: "focal__dot" });
    const placeDot = () => {
      const [x, y] = (img.pos || "50% 50%").split(" ");
      dot.style.left = x; dot.style.top = y;
    };
    placeDot();
    const focal = h("div", {
      class: "focal",
      title: "點一下設定要對準的位置",
      onclick: e => {
        const r = focal.getBoundingClientRect();
        const x = Math.round(((e.clientX - r.left) / r.width) * 100);
        const y = Math.round(((e.clientY - r.top) / r.height) * 100);
        img.pos = `${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`;
        placeDot(); crop.sync(); changed();
      }
    }, h("img", { src: img.src, alt: "", draggable: "false" }), dot);

    const out = h("output", {}, `${(img.zoom || 1).toFixed(1)}×`);
    const range = h("input", {
      type: "range", min: "1", max: "3", step: "0.1", value: img.zoom || 1, "aria-label": "放大",
      oninput: e => { img.zoom = Number(e.target.value); out.textContent = `${img.zoom.toFixed(1)}×`; crop.sync(); changed(); }
    });

    return h("div", { class: "img-item" },
      h("div", {},
        h("p", { class: "img-item__label" }, "原圖（點一下設定對準的位置）"),
        focal),
      h("div", { class: "img-item__controls" },
        h("p", { class: "img-item__label" }, label),
        crop.node,
        h("div", {}, h("p", { class: "img-item__label" }, "放大"), h("div", { class: "range" }, range, out)),
        h("label", { class: "field" },
          h("span", {}, "圖片說明（給看不到圖的讀者）"),
          h("input", { type: "text", value: img.alt || "", maxlength: "200", placeholder: "例如：小青蛙抓著葉子飛",
            oninput: e => { img.alt = e.target.value; changed(); } })),
        h("div", { class: "img-item__buttons" }, ...buttons))
    );
  }

  /* ---------- 共用：內容編輯（卡片 / 關於） ---------- */
  function entryEditor(entry, { isAbout = false, rerender }) {
    const fields = h("div", { class: "panel" },
      h("h2", {}, "文字"),
      h("p", { class: "hint" }, isAbout ? "按首頁右上角 ⓘ 會看到這段介紹。" : "卡片下方的標題、簡介，以及點開後的內文。"),
      h("label", { class: "field" }, h("span", {}, "標題"),
        h("input", { type: "text", value: entry.title || "", maxlength: "120", required: true,
          oninput: e => { entry.title = e.target.value; changed(); } })),
      !isAbout && h("div", { class: "grid-2" },
        h("label", { class: "field" }, h("span", {}, "分類"),
          (() => {
            const cats = [...new Set([...(doc.site.categories || []), entry.tag].filter(Boolean))];
            return h("select", { onchange: e => { entry.tag = e.target.value; changed(); } },
              h("option", { value: "" }, "（不分類）"),
              ...cats.map(c => h("option", { value: c, selected: c === entry.tag }, c)));
          })(),
          h("small", {}, "分類名稱在「網站設定」修改")),
        h("label", { class: "field" }, h("span", {}, "狀態"),
          h("span", { class: "check" },
            h("input", { type: "checkbox", checked: entry.published !== false,
              onchange: e => { entry.published = e.target.checked; changed(); } }),
            "公開在網站上"))),
      !isAbout && h("label", { class: "field" }, h("span", {}, "一行簡介（卡片標題下方）"),
        h("input", { type: "text", value: entry.summary || "", maxlength: "200",
          oninput: e => { entry.summary = e.target.value; changed(); } })),
      h("label", { class: "field" }, h("span", {}, "內文"),
        h("textarea", { maxlength: "20000",
          oninput: e => { entry.text = e.target.value; changed(); count.textContent = `${paraCount(entry.text)} 段`; } }, entry.text || ""),
        (() => { var c = h("small", {}); return c; })())
    );
    const textarea = fields.querySelector("textarea");
    const count = textarea.nextElementSibling;
    count.textContent = `空一行就是新的一段・目前 ${paraCount(entry.text)} 段`;
    textarea.addEventListener("input", () => { count.textContent = `空一行就是新的一段・目前 ${paraCount(entry.text)} 段`; });

    /* 上方大圖 */
    entry.images = entry.images || [];
    const imgList = h("div", { class: "img-list" });
    entry.images.forEach((img, i) => {
      const n = entry.images.length;
      const move = d => { const j = i + d; [entry.images[i], entry.images[j]] = [entry.images[j], entry.images[i]]; changed(); rerender(); };
      imgList.append(imageEditor(img, {
        kind: "card",
        label: i === 0 ? (isAbout ? "第 1 張（最先顯示）" : "第 1 張・也是卡片縮圖") : `第 ${i + 1} 張`,
        buttons: [
          h("button", { class: "icon-btn", type: "button", "aria-label": "往前", disabled: i === 0, onclick: () => move(-1) }, icon(I.left)),
          h("button", { class: "icon-btn", type: "button", "aria-label": "往後", disabled: i === n - 1, onclick: () => move(1) }, icon(I.right)),
          h("button", { class: "btn btn--sm", type: "button", onclick: () => {
            entry.figure = { ...img, zoom: Math.max(img.zoom || 1, 1.6) }; changed(); rerender(); toast("已設為內文小圖");
          } }, "設為內文小圖"),
          h("button", { class: "btn btn--sm btn--danger", type: "button", onclick: () => {
            entry.images.splice(i, 1); changed(); rerender();
          } }, "移除")
        ]
      }));
    });
    if (!entry.images.length) imgList.append(h("p", { class: "empty" }, "還沒有圖片"));

    const uploadInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true,
      onchange: async e => {
        try { entry.images.push(...await uploadFiles(e.target.files)); changed(); rerender(); }
        catch (err) { toast(err.message, true); }
      } });
    const images = h("div", { class: "panel" },
      h("h2", {}, "大圖"),
      h("p", { class: "hint" }, "第 1 張是文章最上方的滿版大圖（也是卡片縮圖），第 2 張起會接在文字後面，一張一張往下排。用 ← → 調整順序。"),
      imgList,
      h("div", { class: "add-row" },
        h("label", { class: "btn btn--primary" }, "上傳圖片", uploadInput),
        h("button", { class: "btn", type: "button", onclick: async () => {
          const img = await pickImage(); if (img) { entry.images.push(img); changed(); rerender(); }
        } }, "從圖庫選")));

    /* 內文小圖 */
    const figUpload = h("input", { type: "file", accept: "image/*", hidden: true,
      onchange: async e => {
        try { const [img] = await uploadFiles(e.target.files); if (img) { entry.figure = { ...img, zoom: 1 }; changed(); rerender(); } }
        catch (err) { toast(err.message, true); }
      } });
    const figure = h("div", { class: "panel" },
      h("h2", {}, "內文小圖"),
      h("p", { class: "hint" }, "放在文字右邊的直式小圖，可以不放。"),
      entry.figure
        ? imageEditor(entry.figure, { kind: "figure", label: "顯示效果", buttons: [
            h("button", { class: "btn btn--sm btn--danger", type: "button", onclick: () => { entry.figure = null; changed(); rerender(); } }, "移除小圖")
          ] })
        : h("p", { class: "empty" }, "沒有小圖"),
      h("div", { class: "add-row" },
        h("label", { class: "btn" }, entry.figure ? "換一張（上傳）" : "上傳小圖", figUpload),
        h("button", { class: "btn", type: "button", onclick: async () => {
          const img = await pickImage(); if (img) { entry.figure = img; changed(); rerender(); }
        } }, "從圖庫選")));

    return [fields, images, figure];
  }

  /* ---------- 卡片 ---------- */
  function renderCards() {
    const items = doc.items;
    const list = h("ul", { class: "list" });
    items.forEach((it, i) => {
      const thumb = it.images[0];
      const move = d => { const j = i + d; [items[i], items[j]] = [items[j], items[i]]; changed(); renderCards(); };
      list.append(h("li", { class: "row" },
        h("div", { class: "row__thumb" }, thumb && (() => {
          const im = h("img", { src: thumb.src, alt: "", loading: "lazy" });
          im.style.objectPosition = thumb.pos || "50% 50%";
          return im;
        })()),
        h("div", { class: "row__main" },
          h("button", { class: "row__title", type: "button", onclick: () => { location.hash = `#cards/${it.id}`; } }, it.title || "（未命名）"),
          h("div", { class: "row__meta" },
            it.tag && h("span", { class: "badge" }, it.tag),
            it.published === false && h("span", { class: "badge badge--draft" }, "草稿・未公開"))),
        h("div", { class: "row__actions" },
          h("button", { class: "icon-btn", type: "button", "aria-label": "往上移", disabled: i === 0, onclick: () => move(-1) }, icon(I.up)),
          h("button", { class: "icon-btn", type: "button", "aria-label": "往下移", disabled: i === items.length - 1, onclick: () => move(1) }, icon(I.down)),
          h("button", { class: "btn btn--sm", type: "button", onclick: () => { location.hash = `#cards/${it.id}`; } }, "編輯"))
      ));
    });

    view.replaceChildren(
      h("div", { class: "view__head" },
        h("h1", {}, "卡片"),
        h("button", { class: "btn btn--primary", type: "button", onclick: () => {
          const it = { id: uid(), tag: (doc.site.categories || [])[0] || "", title: "新的卡片", summary: "", text: "", images: [], figure: null, published: false };
          doc.items.unshift(it); changed();
          location.hash = `#cards/${it.id}`;
        } }, "＋ 新增卡片")),
      h("p", { class: "hint" }, "首頁的卡片會照這裡的順序排列。新卡片預設是草稿，記得打勾「公開」再儲存。"),
      items.length ? list : h("p", { class: "empty" }, "還沒有卡片")
    );
  }

  function renderCardEditor(id) {
    const it = doc.items.find(x => x.id === id);
    if (!it) { location.hash = "#cards"; return; }
    const rerender = () => { const y = scrollY; renderCardEditor(id); scrollTo(0, y); };
    view.replaceChildren(
      h("a", { class: "btn btn--ghost back", href: "#cards" }, icon(I.back), "回到卡片列表"),
      h("div", { class: "view__head" }, h("h1", {}, it.title || "（未命名）")),
      ...entryEditor(it, { rerender }),
      h("div", { class: "danger-zone" },
        h("button", { class: "btn btn--danger", type: "button", onclick: () => {
          if (!confirm(`確定要刪除「${it.title}」嗎？\n（按下儲存之後才會真的刪除）`)) return;
          doc.items = doc.items.filter(x => x !== it); changed(); location.hash = "#cards";
        } }, icon(I.trash), "刪除這張卡片"))
    );
    // 標題即時更新到頁首
    view.querySelector(".panel input").addEventListener("input", e => { view.querySelector(".view__head h1").textContent = e.target.value || "（未命名）"; });
  }

  /* ---------- 關於 ---------- */
  function renderAbout() {
    const rerender = () => { const y = scrollY; renderAbout(); scrollTo(0, y); };
    view.replaceChildren(
      h("div", { class: "view__head" }, h("h1", {}, "關於")),
      ...entryEditor(doc.about, { isAbout: true, rerender })
    );
  }

  /* ---------- 網站設定 ---------- */
  function renderSettings() {
    const s = doc.site;
    const input = (label, key, opts = {}) => h("label", { class: "field" }, h("span", {}, label),
      h(opts.multi ? "textarea" : "input", {
        type: "text", maxlength: opts.max || 200, style: opts.multi ? "min-height:100px" : null,
        oninput: e => { s[key] = e.target.value; changed(); }, value: opts.multi ? null : (s[key] || "")
      }, opts.multi ? (s[key] || "") : null),
      opts.hint && h("small", {}, opts.hint));

    view.replaceChildren(
      h("div", { class: "view__head" }, h("h1", {}, "網站設定")),
      h("div", { class: "panel" },
        h("h2", {}, "基本資料"),
        input("網站名稱", "name", { max: 60, hint: "會出現在瀏覽器分頁和分享連結上" }),
        input("網站標語", "tagline", { max: 120, hint: "不會顯示在首頁。只在「網站描述」留空時，當作社群分享的描述文字" }),
        input("網站描述", "description", { max: 300, multi: true, hint: "給搜尋引擎和社群分享用（Facebook、LINE 預覽）" }),
        input("頁尾文字", "footer", { max: 200 }),
        h("label", { class: "field" }, h("span", {}, "Banner 底色"),
          h("input", { type: "color", value: s.bannerColor || "#ffffff", style: "width:120px;padding:4px",
            oninput: e => { s.bannerColor = e.target.value; changed(); } }),
          h("small", {}, "首頁最上方整條色塊的顏色。選深色時 Logo 會自動變白。"))),
      menuPanel(),
      h("div", { class: "panel" },
        h("h2", {}, "分類"),
        h("p", { class: "hint" }, "一行一個。首頁只會顯示有卡片的分類。改名字的話，卡片也要重新選一次分類。"),
        h("label", { class: "field" }, h("span", {}, "分類清單"),
          h("textarea", { style: "min-height:120px",
            oninput: e => { s.categories = e.target.value.split("\n").map(x => x.trim()).filter(Boolean); changed(); } },
            (s.categories || []).join("\n"))))
    );
  }

  /* ---------- 首頁選單 ---------- */
  const DEFAULT_MENU = [
    { label: "Bulletin Board", image: "/assets/menu/board.svg", href: "#works" },
    { label: "Teacher", image: "/assets/menu/teacher.svg", href: "" },
    { label: "Classroom Activities", image: "/assets/menu/activities.svg", href: "" },
    { label: "Weekly diary", image: "/assets/menu/diary.svg", href: "" },
    { label: "Instagram", image: "/assets/menu/instagram.svg", href: "" }
  ];
  function menuPanel() {
    const s = doc.site;
    if (!Array.isArray(s.menu)) s.menu = [];
    const list = h("div", { class: "menu-list" });
    const redraw = () => { const y = scrollY; renderSettings(); scrollTo(0, y); };
    s.menu.forEach((m, i) => {
      const move = d => { const j = i + d; [s.menu[i], s.menu[j]] = [s.menu[j], s.menu[i]]; changed(); redraw(); };
      const upload = h("input", { type: "file", accept: "image/*", hidden: true,
        onchange: async e => { try { const [img] = await uploadFiles(e.target.files); if (img) { m.image = img.src; changed(); redraw(); } } catch (err) { toast(err.message, true); } } });
      list.append(h("div", { class: "menu-row" },
        h("div", { class: "field menu-row__img" }, h("span", {}, "圖片"),
          h("div", { class: "menu-thumb" }, m.image ? h("img", { src: m.image, alt: "" }) : h("em", {}, "沒有圖：首頁會顯示文字")),
          h("div", { class: "menu-row__imgbtns" },
            h("label", { class: "btn btn--sm" }, "上傳", upload),
            h("button", { class: "btn btn--sm", type: "button", onclick: async () => { const img = await pickImage(); if (img) { m.image = img.src; changed(); redraw(); } } }, "從圖庫選"),
            m.image && h("button", { class: "btn btn--sm btn--danger", type: "button", onclick: () => { m.image = ""; changed(); redraw(); } }, "清除"))),
        h("label", { class: "field" }, h("span", {}, "名稱（給看不到圖的人 / 沒圖時顯示）"),
          h("input", { type: "text", value: m.label || "", maxlength: "40", oninput: e => { m.label = e.target.value; changed(); } })),
        h("label", { class: "field menu-row__href" }, h("span", {}, "連結"),
          h("input", { type: "text", value: m.href || "", maxlength: "300", placeholder: "例如 #works、/about 或 https://instagram.com/…",
            oninput: e => { m.href = e.target.value; changed(); } })),
        h("div", { class: "menu-row__btns" },
          h("button", { class: "icon-btn", type: "button", "aria-label": "往前", disabled: i === 0, onclick: () => move(-1) }, icon(I.up)),
          h("button", { class: "icon-btn", type: "button", "aria-label": "往後", disabled: i === s.menu.length - 1, onclick: () => move(1) }, icon(I.down)),
          h("button", { class: "icon-btn", type: "button", "aria-label": "刪除", onclick: () => { s.menu.splice(i, 1); changed(); redraw(); } }, icon(I.trash)))));
    });
    if (!s.menu.length) list.append(h("p", { class: "empty" }, "沒有選單項目（首頁只會顯示 Logo 下方的線）"));
    return h("div", { class: "panel" },
      h("h2", {}, "首頁選單"),
      h("p", { class: "hint" }, "Logo 下方那一排，最多 8 個，由上到下就是由左到右。每一項放一張圖（高度會縮放成 36px，建議寬度比高度長、背景透明的 PNG / WebP）。連結留空的話，那一項會顯示但點不動。\n#works 是捲到作品區；也可以填 https:// 開頭的網址（會在新分頁開啟）。"),
      list,
      h("div", { class: "add-row" },
        s.menu.length < 8 && h("button", { class: "btn", type: "button", onclick: () => { s.menu.push({ label: "新項目", image: "", href: "" }); changed(); redraw(); } }, "＋ 新增選單項目"),
        h("button", { class: "btn btn--ghost", type: "button", onclick: () => { if (!confirm("要把選單還原成預設的五個項目嗎？")) return; s.menu = DEFAULT_MENU.map(m => ({ ...m })); changed(); redraw(); } }, "還原預設選單")));
  }

  /* ---------- 圖庫 ---------- */
  async function renderMedia() {
    const grid = h("div", { class: "media-grid" });
    const up = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true,
      onchange: async e => { try { await uploadFiles(e.target.files); renderMedia(); } catch (err) { toast(err.message, true); } } });
    view.replaceChildren(
      h("div", { class: "view__head" }, h("h1", {}, "圖庫"), h("label", { class: "btn btn--primary" }, "上傳圖片", up)),
      h("p", { class: "hint" }, "上傳過的圖片都在這裡。沒有被使用的圖片才可以刪除。手機拍的大照片會自動縮小。"),
      grid);
    try {
      const list = await api("/media");
      if (!list.length) grid.append(h("p", { class: "empty" }, "還沒有圖片"));
      list.forEach(m => grid.append(h("div", { class: "media" },
        h("img", { src: m.src, alt: "", loading: "lazy" }),
        h("div", { class: "media__info" },
          h("span", {}, m.used ? "使用中" : (m.deletable ? `${Math.round(m.size / 1024)} KB` : "內建")),
          m.deletable && h("button", { class: "btn btn--sm btn--danger", type: "button", onclick: async () => {
            if (!confirm("確定要刪除這張圖片嗎？")) return;
            try { await api("/media/" + encodeURIComponent(m.src.split("/").pop()), { method: "DELETE" }); toast("已刪除"); renderMedia(); }
            catch (err) { toast(err.message, true); }
          } }, "刪除")))));
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- 帳號 ---------- */
  function renderAccount() {
    const err = h("p", { class: "form-error", role: "alert" });
    const form = h("form", { class: "panel", onsubmit: async e => {
      e.preventDefault();
      const f = new FormData(form);
      if (f.get("next") !== f.get("confirm")) { err.textContent = "兩次輸入的新密碼不一樣"; return; }
      try {
        await api("/password", { method: "POST", json: { current: f.get("current"), next: f.get("next") } });
        form.reset(); err.textContent = ""; toast("密碼已更新，其他裝置需要重新登入");
      } catch (e2) { err.textContent = e2.message; }
    } },
      h("h2", {}, "修改密碼"),
      h("p", { class: "hint" }, "新密碼至少 8 個字。"),
      h("label", { class: "field" }, h("span", {}, "目前密碼"), h("input", { type: "password", name: "current", autocomplete: "current-password", required: true })),
      h("div", { class: "grid-2" },
        h("label", { class: "field" }, h("span", {}, "新密碼"), h("input", { type: "password", name: "next", autocomplete: "new-password", minlength: "8", required: true })),
        h("label", { class: "field" }, h("span", {}, "再輸入一次"), h("input", { type: "password", name: "confirm", autocomplete: "new-password", minlength: "8", required: true }))),
      err,
      h("button", { class: "btn btn--primary", type: "submit" }, "更新密碼"));

    view.replaceChildren(
      h("div", { class: "view__head" }, h("h1", {}, "帳號")),
      canChangePassword ? form : h("div", { class: "panel" },
        h("h2", {}, "後台密碼"),
        h("p", { class: "hint" }, "網站在線上運作時，後台密碼存在 Vercel 專案的環境變數 ADMIN_PASSWORD。要換密碼，到 Vercel 專案的 Settings → Environment Variables 修改，再重新部署一次即可。")),
      h("div", { class: "panel" },
        h("h2", {}, "備份"),
        h("p", { class: "hint" }, "下載所有文字內容（JSON 檔）。系統每次儲存也會自動保留最近 30 份備份。"),
        h("a", { class: "btn", href: "/api/admin/backup", download: true }, "下載備份")));
  }

  /* ---------- 路由 ---------- */
  function route() {
    if (!doc) return;
    const [tab, sub] = (location.hash.slice(1) || "cards").split("/");
    document.querySelectorAll(".tabs a").forEach(a => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (tab === "cards" && sub) renderCardEditor(sub);
    else if (tab === "settings") renderSettings();
    else if (tab === "media") renderMedia();
    else if (tab === "account") renderAccount();
    else renderCards();
    editing = sub || null;
  }
  window.addEventListener("hashchange", () => { route(); scrollTo(0, 0); });

  /* ---------- 登入 / 登出 ---------- */
  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#login-form").password.focus();
  }
  async function showApp() {
    doc = await api("/content");
    savedJSON = JSON.stringify(doc);
    $("#login").hidden = true;
    $("#app").hidden = false;
    changed();
    route();
  }

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    $("#login-error").textContent = "";
    try {
      await api("/login", { method: "POST", json: { password: e.target.password.value } });
      try { canChangePassword = (await api("/me")).canChangePassword !== false; } catch {}
      e.target.reset();
      await showApp();
    } catch (err) { $("#login-error").textContent = err.message; }
    finally { btn.disabled = false; }
  });

  $("#logout").addEventListener("click", async () => {
    if (isDirty() && !confirm("還有變更沒儲存，確定要登出嗎？")) return;
    await api("/logout", { method: "POST" }).catch(() => {});
    doc = null; savedJSON = "";
    showLogin();
  });

  api("/me").then(r => { canChangePassword = r.canChangePassword !== false; return r.authed ? showApp() : showLogin(); }).catch(showLogin);
})();
