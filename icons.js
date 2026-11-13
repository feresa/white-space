/* 選單圖示：線條風格；內容畫在 32×32 的格子裡，顯示時裁成 26×26 讓圖案撐滿，顏色跟隨文字（currentColor） */
const ICONS = {
  board:     '<rect x="4.5" y="7" width="23" height="19" rx="3"/><path d="M11 4.5v5M21 4.5v5M10 15.5h12M10 20h12"/>',
  owl:       '<path d="M5.5 12c0-3.2 1-5.8 2.2-7.5 2.7 1.2 5.2 2.2 8.3 2.2s5.6-1 8.3-2.2c1.2 1.7 2.2 4.3 2.2 7.5v7c0 5.2-4.6 9-10.5 9S5.5 24.2 5.5 19z"/><circle cx="11" cy="14.5" r="4.3"/><circle cx="21" cy="14.5" r="4.3"/><circle cx="11" cy="14.5" r="1.5"/><circle cx="21" cy="14.5" r="1.5"/><path d="M16 18.6l-1.4 2.4h2.8z"/>',
  plane:     '<path d="M3.5 14.5 28.5 4.5l-6 23-7.5-7z"/><path d="M15 20.5 28.5 4.5M15 20.5V27l3.8-3.8"/>',
  book:      '<rect x="7" y="3.5" width="18" height="23" rx="2"/><path d="M11.5 3.5v23M15.5 9.5h6M15.5 13.5h6M15.5 18h3M11.5 26.5v3.5l2.2-1.6 2.2 1.6v-3.5"/>',
  instagram: '<rect x="4.5" y="4.5" width="23" height="23" rx="7"/><circle cx="16" cy="16" r="5.4"/><circle cx="23" cy="9" r=".9" fill="currentColor" stroke="none"/>',
  mail:      '<rect x="4" y="7" width="24" height="18" rx="2.5"/><path d="m5 9 11 9 11-9"/>',
  home:      '<path d="M5 15 16 5.5 27 15M8 13v13.5h16V13M13.5 26.5V19h5v7.5"/>',
  heart:     '<path d="M16 27C6 20 4.5 14.5 4.5 11.5a6 6 0 0 1 11.5-2.3 6 6 0 0 1 11.5 2.3C27.5 14.5 26 20 16 27z"/>',
  star:      '<path d="m16 4.5 3.4 7.3 7.9.9-5.9 5.4 1.6 7.8L16 21.9l-7 4 1.6-7.8-5.9-5.4 7.9-.9z"/>',
  link:      '<path d="M13.5 18.5a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-1.5 1.5M18.5 13.5a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l1.5-1.5"/>'
};

const svg = key => ICONS[key]
  ? `<svg class="menu__icon" viewBox="3 3 26 26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`
  : "";

module.exports = { ICONS, svg, names: Object.keys(ICONS) };
