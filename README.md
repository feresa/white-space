# 留白教室 White Space

純 HTML / CSS / JS 靜態網站，直接打開 `index.html` 就能看。

## 檔案
- `index.html`：版面（Banner、分類、卡片、彈出視窗）
- `content.js`：**卡片內容都在這裡改**（標題、分類、內文、圖片）
- `style.css`：樣式
- `script.js`：互動（分類篩選、彈出視窗、換圖、下一篇）
- `assets/`：圖片

## 換成自己的圖片
把圖片放進 `assets/`，到 `content.js` 改 `src`，並把 `tone` 拿掉即可。

## 本機預覽
```bash
python3 -m http.server 8000
```
打開 http://localhost:8000
