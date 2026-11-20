# 交接說明：留白教室 White Space

給接手的人（或 AI 代理）看的。先讀完這份，再動程式。

## 現況

- 線上網址：https://white-space-eight.vercel.app/
- 後台：https://white-space-eight.vercel.app/admin/
- GitHub：`feresa/white-space`
- 正式分支：`main`（Vercel 的 Production Branch 已設為 `main`，合併進 `main` 就會自動部署正式網站）
- 開發分支：`claude/funny-franklin-njhmmf`，改完開 PR 合併到 `main`
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
  - Instagram 選單連到 https://www.instagram.com/white_space_life（後台選單沒填連結時自動補上）。
- **卡片**：標題下方只顯示「一行簡介」，不顯示分類。
- **圖片**：上傳時記下原圖寬高（`w`/`h`），前台先留好比例的位置；超過 400KB 的 JPG/PNG/WebP 會在瀏覽器轉成 WebP。舊圖打開後台那篇文章、按儲存就會補上寬高。
- **排序**：首頁和分類頁依文章「日期」由新到舊。
- **文章視窗**：整頁白底（不是浮動紙張）。
  - 電腦版（1001px 以上）不滿版：內容寬 `--pw = min(1152px, 60vw)`，其餘尺寸都用「設計稿數值 × pw / 1152」換算（設計稿 1920 寬：內容 1152、左右各留 384）。結尾青蛙 89 寬、連結字 13.5。
  - 上方固定列：左 Logo（點了回首頁）、右兩顆圓形按鈕（下一篇、關閉），下方細線；捲動時固定。
  - 上一篇、分享交給瀏覽器（手機內建瀏覽器底部本來就有）。打開文章會記一筆瀏覽紀錄，按瀏覽器「返回」= 關閉文章。
  - 大圖完整顯示原圖比例。後台「大圖」放 2 張以上就自動輪播（4.5 秒、淡入淡出、下方圓點、手機可左右滑）；框的比例照第 1 張，其他張完整放進框裡。第 1 張也是卡片縮圖。
  - 後台的長文字框（文章內文、區塊文字）會跟著內容自動長高。
  - 內文後面接「內容區塊」（`sections`：一張圖＋一段文字）：電腦版圖 400 寬、圖文左右交錯；手機版圖在上置中、文字在下；沒圖就是整段文字。後台可一次上傳多張照片自動建區塊。
  - 結尾（電腦、平板一排；手機照設計稿量的比例（vw），分兩行「公佈欄／關於老師」「課堂活動／週記／IG小黑板」、跟青蛙垂直置中）：左邊青蛙 `public/assets/frog-end.png`（設計師原圖），右邊中文分類連結「公佈欄／關於老師／課堂活動／週記／IG小黑板」（取自選單的「中文名稱」），再來細線＋版權。
  - 打開時焦點放在文章本身，按鈕不能出現焦點方框。
  - 每篇有自己的網址 `#p=<id>`（瀏覽器分享就會分享這篇）。

## 使用者偏好

- 回覆用繁體中文，簡潔、口語。
- 使用者是設計導向，會給設計稿截圖要求「完全照做」：先量比例再改，改完截圖並排比對。
- 每次修改：本機測試 → commit → push 到開發分支 → 開 PR 合併到 `main` → 確認 Vercel 部署完成 → 回報線上網址。

## 待辦／可能的下一步

- Teacher、Bulletin Board 分類目前沒有文章。
