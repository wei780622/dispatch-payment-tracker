# 派工薪資明細系統（Dispatch Payment Tracker）

設計文件：`docs/superpowers/specs/2026-09-12-dispatch-payment-tracker-design.md`
實作計畫：`docs/superpowers/plans/2026-09-12-dispatch-core-and-form.md`

## 開發

```bash
npm test
```

## 部署

1. 把 `shared/*.js`、`gas/Code.js` 的內容複製貼到 Apps Script 編輯器對應的 `.gs` 檔
2. `gas/Code.js` 頂端的 `SPREADSHEET_ID` 改成實際試算表 ID **（目前已部署的正式試算表 ID 見 Google Sheet 網址；每次重新複製貼上 `gas/Code.js` 到 Apps Script 編輯器時務必再次確認這一行沒有被 placeholder 覆蓋掉）**
3. Apps Script 編輯器執行一次 `setupSheets()` 建立分頁
4. 在 `SDI_工程師`／`HDC_工程師` 分頁手動加入工程師姓名，`啟用中` 欄位務必填 `TRUE`（大寫字串或核取方塊皆可，程式只認 boolean `true` 或字串 `'TRUE'`），否則表單的姓名下拉選單會是空的。
5. Deploy → New deployment → Web app（Execute as me / Who has access: Anyone）
6. 把部署後的 URL 貼到 `frontend/shared.js` 的 `SCRIPT_URL`
7. `frontend/` 內容推到 GitHub Pages
