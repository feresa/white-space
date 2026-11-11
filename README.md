# 留白教室 White Space

網站 + 後台編輯系統。電腦、平板、手機都能看，也都能進後台改內容。

- 前台：`/`
- 後台：`/admin/`

## 啟動

需要 Node.js 18 以上。

```bash
npm install
ADMIN_PASSWORD=你的密碼 npm start
```

打開 http://localhost:3000 看網站，http://localhost:3000/admin/ 進後台。

沒有設定 `ADMIN_PASSWORD` 的話，第一次啟動會在終端機印出一組臨時密碼。登入後請到後台「帳號」改掉。
`ADMIN_PASSWORD` 只在第一次建立帳號時使用，之後改密碼請從後台改。

## 後台功能

| 分頁 | 做什麼 |
| --- | --- |
| 卡片 | 新增、編輯、刪除、調整順序、草稿／公開。每張卡片可放多張大圖、一張內文小圖 |
| 關於 | 首頁右上角 ⓘ 彈出的介紹 |
| 網站設定 | 網站名稱、Banner 標語、描述（社群分享預覽）、頁尾、分類 |
| 圖庫 | 看所有上傳過的圖，刪除沒用到的 |
| 帳號 | 改密碼、下載備份 |

圖片可以點一下設定「要對準哪裡」並調整放大，卡片縮圖和小圖都會自動對準主角。
手機拍的大照片上傳前會先在瀏覽器縮小。有變更時畫面下方會出現「儲存」，也可以按 Ctrl/⌘ + S。

## 資料放哪裡

全部在 `data/`（可用 `DATA_DIR` 改位置）：

- `content.json`　所有文字內容
- `uploads/`　上傳的圖片
- `backups/`　每次儲存自動備份，保留最近 30 份
- `auth.json`　密碼（雜湊後存放）

**部署時請把 `data/` 放在會保留的磁碟上**（例如 VPS、Fly.io volume、Railway volume）。
在每次重啟就清空檔案的平台（例如純 Vercel）上，後台的修改會消失。

## 上線建議

- 用 Nginx / Caddy 或平台提供的 HTTPS，並設定 `TRUST_PROXY=1`
- 環境變數：`PORT`、`ADMIN_PASSWORD`、`DATA_DIR`、`TRUST_PROXY`

## 安全

- 密碼用 scrypt 雜湊，登入失敗 8 次鎖 15 分鐘
- Cookie 為 HttpOnly + SameSite=Strict，寫入請求另外要求自訂標頭
- 上傳會檢查檔案真正的格式（只收 JPG / PNG / WebP / GIF / AVIF），單檔 10MB 以內
- 內容寫入前會重新檢查格式與圖片路徑

## 專案結構

```
server.js        伺服器與 API
public/          前台（index.html / style.css / script.js / assets）
admin/           後台
seed/content.json  第一次啟動時的初始內容
.claude/skills/  ui-ux-pro-max 設計 skill
```
