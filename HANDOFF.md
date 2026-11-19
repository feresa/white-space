# 交接說明：留白教室 White Space

給接手的人（或 AI 代理）看的。先讀完這份，再動程式。

## 現況

- 線上網址：https://white-space-eight.vercel.app/
- 後台：https://white-space-eight.vercel.app/admin/
- GitHub：`feresa/white-space`
- 工作分支：`claude/funny-franklin-njhmmf`
  - Vercel 的 Production Branch 目前設定為這個分支，推上去就會自動部署正式網站。
  - `main` 只合併到 PR #1，之後的修改都還在這個分支，尚未合併。
- Vercel 專案：`white-space`（團隊 `feresas-projects`）

## 技術架構

- Node.js + Express，沒有前端框架。入口 `server.js`；Vercel 透過 `api/index.js` + `vercel.json` 執行。
- 儲存層 `storage.js`：
  - 本機：存在 `data/`（`content.json`、`uploads/`、`backups/`、`auth.json`）
  - 線上：有環境變數 `BLOB_READ_WRITE_TOKEN` 時改用 Vercel Blob（私有）
- 首頁範本 `views/index.html`，伺服器把內容塞進 `window.WS_CONTENT`。
- 前台 `public/`（`style.css`、`script.js`、`assets/`）。後台 `admin/`。
- 初始內容 `seed/content.json`（第一次啟動、資料是空的時候用）。

## 密碼與機密

- 線上後台密碼：Vercel 專案環境變數 `ADMIN_PASSWORD`（不要寫進程式或文件）。
- 改密碼：Vercel → Settings → Environment Variables 改 `ADMIN_PASSWORD` → Redeploy。
- 其他環境變數：`SESSION_SECRET`、`BLOB_READ_WRITE_TOKEN`。

## 本機開發

```bash
npm install
ADMIN_PASSWORD=test-pass-123 DATA_DIR=/tmp/ws-data PORT=3100 node server.js
```

前台 http://localhost:3100 ，後台 http://localhost:3100/admin/

## 目前的功能與設計決定（不要改掉）

- **首頁**：白底，Logo 置中（點 Logo 回首頁），下方選單 + 一條線，卡片 16:9 格狀，電腦 3 欄／平板 2 欄／手機 1 欄。手機卡片圖用原圖比例。
- **選單**：圖示是從設計稿切出來的 SVG（`public/assets/menu/icon-*.svg`），文字用 Nunito 800。手機版固定兩欄（2 / 2 / 1）。
- **分類**：Bulletin Board、Teacher、Classroom Activities、Weekly diary，網址 `/c/<slug>`。
  - Bulletin Board 的文章**不顯示在首頁**，只在自己的分類頁出現（後台「網站設定 → 顯示在首頁」可調）。
  - Instagram 選單目前沒有連結。
- **排序**：首頁和分類頁依文章「日期」由新到舊。
- **文章視窗**：置中白色紙張、右下陰影、四周純白。
  - 大圖完整顯示原圖比例；只用每篇文章的第 1 張圖。
  - 結尾固定放青蛙圖 `public/assets/frog-end.png`（設計師原圖），後面不放其他圖。
  - 右下四顆圓形按鈕：上一篇、下一篇、關閉、分享（SVG 正圓，尺寸照設計稿）。手機版四顆置中平均分配。
  - 打開時焦點放在文章本身，按鈕不能出現焦點方框。
  - 分享：手機用系統分享，電腦複製連結；每篇有自己的網址 `#p=<id>`。

## 使用者偏好

- 回覆用繁體中文，簡潔、口語。
- 使用者是設計導向，會給設計稿截圖要求「完全照做」：先量比例再改，改完截圖並排比對。
- 每次修改：本機測試 → commit → push 到工作分支 → 確認 Vercel 部署完成 → 回報線上網址。

## 待辦／可能的下一步

- 把工作分支合併回 `main`（開 PR），並把 Vercel Production Branch 改成 `main`。
- Instagram 選單填上實際連結。
- Teacher、Bulletin Board 分類目前沒有文章。
