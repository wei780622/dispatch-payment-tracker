# 派工薪資明細系統（Dispatch Payment Tracker）

設計文件：`docs/superpowers/specs/2026-09-12-dispatch-payment-tracker-design.md`
實作計畫：`docs/superpowers/plans/2026-09-12-dispatch-core-and-form.md`

## 開發

```bash
npm test
```

## 部署

1. 把 `shared/*.js`、`gas/Code.js` 的內容複製貼到 Apps Script 編輯器對應的 `.gs` 檔
2. `gas/Code.js` 頂端的 `SPREADSHEET_ID` 改成實際試算表 ID
3. Apps Script 編輯器執行一次 `setupSheets()` 建立分頁
4. Deploy → New deployment → Web app（Execute as me / Who has access: Anyone）
5. 把部署後的 URL 貼到 `frontend/shared.js` 的 `SCRIPT_URL`
6. `frontend/` 內容推到 GitHub Pages
