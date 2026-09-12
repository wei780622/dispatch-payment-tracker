# 派工薪資明細系統（Dispatch Payment Tracker）設計文件

- 日期：2026-09-12
- 狀態：待實作
- 參考架構：GMI 機房建置系統（GBIC Tracker）— GAS + Google Sheet + GitHub Pages

## 背景與目的

CSI 目前用 Excel 手動維護兩份月報表，記錄工程師派工的服務費、加班費、交通住宿費，最後加總換算美金給客戶請款：

- `Samsung SDI dispatch payment detail_CSI{yymm}.xlsx`
- `HDC dispatch payment detail_CSI{yymm}.xlsx`

目標是做一個網站，讓工程師自行上網填寫每日派工紀錄，資料存進 Google Sheet，並可一鍵匯出與現有範例格式相同的月結算 Excel，取代目前手動維護。

## 整體架構

```
GitHub Pages（靜態前端）
  ├─ index.html                    首頁：「SAMSUNG SDI 維運表單」/「HANGANG NCS & HDC 維運表單」兩個按鈕
  ├─ form.html?project=SDI|HDC     派工紀錄填寫（工程師用，免登入）
  ├─ my.html?project=SDI|HDC       我的紀錄（查詢、編輯、刪除當月自己的紀錄）
  └─ admin.html?mode=admin         管理後台（Wei 用）
        ↓ fetch（GET/POST，action 參數路由）
Google Apps Script Web App（單一部署）
        ↓
Google Spreadsheet（單一試算表，SDI / HDC 各自獨立分頁）
```

沿用 GBIC 的既有模式：GAS `doGet`/`doPost` 依 `action` 路由、前端純 HTML/CSS/vanilla JS、部署方式為「改 Code.gs → New deployment → 更新前端 SCRIPT_URL → 貼到 GitHub repo」。

## Google Sheet 結構

每個專案（SDI / HDC）各有一組分頁，共用同一份試算表：

### `{SDI|HDC}_紀錄`

| 欄位 | 說明 |
|---|---|
| RecordID | 唯一識別碼，供編輯/刪除定位 |
| 建立時間 | 送出時間戳 |
| 修改時間 | 最後編輯時間戳 |
| 類型 | `派工` \| `固定費用` |
| No. | 序號（匯出時依序重新編號，不依賴此欄） |
| Dispatch No. | 如 `PR26A014-260707-A`，同一派工的兩人共用同一組 |
| Project | 派工說明文字，同一派工的兩人共用 |
| Date | 日期 |
| 姓名 | 下拉選單選出的工程師姓名，或固定費用的費用說明 |
| 角色 | `Engineer` \| `Worker`（僅類型=派工時有值） |
| 單價 | 依角色從單價表帶入 |
| 稅前單價 | = 單價 ÷ 1.05 |
| 出發時間 / 上班時間 / 下班時間 | 時間輸入 |
| 工時 | = HOUR(下班時間 − 上班時間) |
| 天數 | = 工時 ÷ 8 |
| 加班時數 | 手動輸入，預設 0 |
| 加班費 | = 稅前單價 ÷ 8 × 加班時數 × 1.34 |
| mark up (5%) | = 稅前單價 × 5% × 天數 |
| 服務費小計 | = (稅前單價 × 天數) + 加班費 + mark up |
| 交通費 / 住宿費 | 手動輸入金額 |
| 交通住宿小計 | = 交通費 + 住宿費 |
| 合計 Amount | = 服務費小計 + 交通住宿小計 |
| 狀態 | `正常` \| `已刪除`（軟刪除，保留稽核軌跡） |
| 案場名稱 | 下拉選單選出的案場（新增，見下「路線佐證」） |
| 出發地 | 出發地地址，預填公司地址、可修改（新增） |
| 抵達地 | 自動帶入所選案場地址，不可改（新增） |
| 途經 | 選填，多個經由點以 ` \| ` 串接成一個字串（新增） |
| PDF網址 | 路線佐證 PDF 的 Google Drive 連結，送出時留空，由 Wei/Claude 事後產生並手動填入（新增） |

固定費用列（如 Warehouse fee）：類型=`固定費用`，姓名欄放費用說明，Dispatch No.=`X`，僅「合計 Amount」有值，其餘計算欄位留空，由管理後台直接新增，不經過工程師表單。

**既有正式環境遷移**：`案場名稱`／`出發地`／`抵達地`／`途經`／`PDF網址` 是在系統上線後才新增的欄位，既有的 `SDI_紀錄`／`HDC_紀錄` 分頁已經有資料且欄位到 Z（26 欄），這 5 個新欄位要用一次性遷移函式接在後面（AA~AE）新增表頭，不能重建分頁（會遺失既有資料）。

### `{SDI|HDC}_工程師`

| 姓名 | 啟用中 |
|---|---|

單純提供表單下拉選單來源，姓名新增/停用由管理後台維護。

### `{SDI|HDC}_案場`（新增）

| 案場名稱 | 地址 | 啟用中 |
|---|---|---|

供派工表單「案場名稱」下拉選單來源，新增/停用由管理後台維護，跟工程師名單同一套邏輯（不刪除、只切換啟用狀態，保留歷史）。

### `設定`

| 專案 | Dispatch No. 前綴 | Engineer 單價 | Worker 單價 |
|---|---|---|---|
| SDI | PR26A014 | 9200 | 7000 |
| HDC | PR26A014 | 10200 | 8800 |

單價表與前綴集中管理，不寫死在程式碼中，未來調整不需改程式。

## 派工填寫流程

1. 工程師從首頁點選 SDI 或 HDC 按鈕進入 `form.html?project=...`
2. 選姓名（下拉）、選日期
3. 系統依「所選日期」查詢該專案「未滿 2 人的既有派工」清單，工程師二選一：
   - **新增派工**：輸入 Project 說明文字 → 系統配發新 Dispatch No（當天下一個字母 A/B/C...）→ 角色：SDI 固定為 `Engineer`（9200）／HDC 由工程師自選 `Worker`(8800) 或 `Engineer`(10200)
   - **加入既有派工**：從清單選一筆 → 沿用其 Dispatch No / Project → 角色：SDI 固定為 `Worker`（7000）／HDC 由工程師自選
4. 填寫出發時間、上班時間、下班時間、加班時數、交通費、住宿費
5. 系統即時試算並顯示稅前單價、工時、天數、加班費、mark up、服務費小計、交通住宿小計、合計
   - 若工時計算結果不是 4 或 8 小時，跳出確認視窗提示「工時為 X 小時，通常應為 4 或 8 小時，請確認上下班時間」，可修正時間或選擇仍要送出
6. **（新增，必填）路線佐證資訊**：
   - 選「案場名稱」（下拉，來自 `{project}_案場`）
   - 「出發地」預填公司地址（中華系統整合股份有限公司國分辦公室，106001臺北市大安區光明里愛國東路31號8樓），可修改
   - 「抵達地」自動帶入所選案場的地址，不可改
   - 「途經」選填，可按「+ 新增經由點」加入多個地址（例如中途休息站、加油站），用於之後產生 Google Maps 路線圖時加入 waypoints
7. 送出 → 寫入 Google Sheet，回到成功頁

## 我的紀錄（my.html）

- 選姓名 + 年月，列出自己當月已送出的派工紀錄
- 可編輯（修改後重新試算金額）或刪除（軟刪除）**當月**紀錄
- 跨月的舊紀錄不可自行修改，僅能請管理後台（Wei）處理

## 管理後台安全機制（網站已公開部署，新增設計）

網站部署在 GitHub Pages（public repo），任何人都能開啟 `admin.html`，因此管理後台需要一道後端強制的密碼保護，而不只是靠網址參數隱藏：

- 管理密碼存在 GAS 的 **Script Properties**（`PropertiesService.getScriptProperties()`），不寫在 Google Sheet 或前端程式碼裡
- `admin.html` 進入時跳出輸入框要求密碼，成功後存在瀏覽器 `sessionStorage`，之後每個管理動作的 API 呼叫都夾帶這組密碼（例如 payload 裡的 `adminPin` 欄位）
- 每一個 `adminXxx` action 在 GAS 端開頭都要驗證 `payload.adminPin` 是否等於 Script Properties 裡存的密碼，不對就回傳 `{ok:false, error:'密碼錯誤'}` 並拒絕執行——真正的防護在後端驗證，前端輸入框只是收集密碼，不能被略過

## 管理後台（admin.html?mode=admin）

- 檢視/篩選（依專案、年月、姓名，可切換是否顯示已刪除）/編輯/刪除任一筆紀錄，含跨月舊紀錄——管理後台可編輯的欄位比工程師版「我的紀錄」更完整，包含日期、Dispatch No.、Project、角色、單價，因為管理者需要能修正工程師填錯的情況
- 新增固定費用列（Warehouse fee 等非個人派工費用）
- 維護工程師名單（新增姓名、切換啟用/停用，不刪除以保留歷史）
- 維護 `設定` 分頁（Dispatch No. 前綴、Engineer/Worker 單價）
- 產生月結算 Excel（見下）

## 月結算 Excel 匯出

- 管理後台選專案 + 年月 + 輸入當月美金匯率，按下「產生 Excel」
- 匯出樣板由 **GAS 程式碼動態建立**（不需要人工在 Sheet 裡手動排版）：程式建立一個暫存分頁，寫入與現有範例相同的多層表頭、合併儲存格，資料列的計算欄位一律用儲存格公式（例如稅前單價欄寫 `=G5/1.05`，而非寫死數字），維持與原始 Excel 一致的「打開後還能看到公式、可手動微調」的特性
- 依日期排序填入該年月所有「狀態=正常」的派工紀錄與固定費用列，寫入 `Total = SUM(Amount)`、`EXCHANGE RATE`（手動輸入的匯率）、`FINAL TOTAL = Total ÷ Rate` 公式
- 透過 Google Sheets 匯出端點（`/export?format=xlsx&gid=...`）搭配 `UrlFetchApp` 把該暫存分頁轉成 `.xlsx` 內容，用 base64 回傳前端觸發下載，匯出後刪除暫存分頁
- 檔名比照現況：`{SDI|HDC} dispatch payment detail_CSI{yymm}.xlsx`

## 路線佐證 PDF（新增）

**目的**：派工紀錄附上一份 Google Maps 路線列印 PDF（含地圖、逐步轉彎指示、距離時間、收費路段提示），作為交通費核銷佐證，格式比照現行人工用 Google Maps「列印」功能另存的 PDF。

**技術限制**：GAS 後端無法操作瀏覽器、無法執行網頁「列印成 PDF」，因此不做成送出當下自動產生的即時功能。分工方式：

- **系統**：只負責在派工紀錄裡存「案場名稱、出發地、抵達地、途經」這幾個欄位（見上「Google Sheet 結構」與「派工填寫流程」）
- **PDF 產生**：由 Wei 事後請 Claude（透過瀏覽器自動化）批次處理——對有路線資訊、`PDF網址` 欄位還是空的紀錄，逐筆開啟 Google Maps 路線規劃頁面（帶入出發地/抵達地/途經），用瀏覽器「列印」存成 PDF，上傳到 Google Drive，再把分享連結手動貼回該筆紀錄的 `PDF網址` 欄位（直接在 Google Sheet 編輯，不需要額外的 API action）
- 不需要 Google Maps Platform API Key，不涉及額外費用

## GAS API Actions（規劃）

| action | 說明 |
|---|---|
| `getEngineers` | 依專案取得啟用中的工程師名單 |
| `getOpenDispatches` | 取得某日某專案「未滿 2 人」的既有派工清單 |
| `getSites` | 依專案取得啟用中的案場名單（名稱+地址） |
| `submitRecord` | 新增一筆派工紀錄（含新增派工/加入既有派工邏輯、自動配號、路線資訊） |
| `getMyRecords` | 依姓名 + 年月取得自己送出的紀錄 |
| `updateMyRecord` | 工程師修改自己當月的紀錄 |
| `deleteMyRecord` | 工程師軟刪除自己當月的紀錄 |
| `adminGetRecords` | 依專案/年月/姓名篩選查詢所有紀錄（含跨月、可選是否含已刪除） |
| `adminUpdateRecord` / `adminDeleteRecord` | 管理後台編輯/刪除任一筆（含跨月，可改欄位比工程師版更完整） |
| `adminAddFixedFee` | 新增固定費用列 |
| `adminGetSettings` / `adminUpdateSettings` | 讀取/更新 Dispatch No. 前綴與單價表 |
| `adminGetEngineers` / `adminAddEngineer` / `adminToggleEngineer` | 工程師名單維護 |
| `adminGetSites` / `adminAddSite` / `adminToggleSite` | 案場名單維護 |
| `exportMonthlyExcel` | 產生並回傳月結算 Excel（base64） |

以上所有 `adminXxx` action 都必須在 payload 帶入 `adminPin`，後端驗證通過才會執行（見「管理後台安全機制」）。

## 權限規則

- 表單填寫、我的紀錄：免登入，靠選姓名辨識（信任制，比照 GBIC）
- 我的紀錄僅能操作「自己 + 當月」的資料
- 跨月資料一律鎖定，僅管理後台（`?mode=admin`）可異動
- 刪除一律採軟刪除（狀態欄位標記），保留稽核軌跡，避免誤刪金額對不上

## 測試重點

- 稅前單價、工時、天數、加班費、mark up、服務費小計、交通住宿小計、合計 的計算公式正確性
- 工時非 4/8 小時的跳窗提示與強制送出選項
- 新增派工／加入既有派工的 Dispatch No. 配號邏輯（同日多組派工、同一派工兩人共用編號）
- SDI／HDC 角色與單價對應（SDI 依順序自動決定角色；HDC 由使用者自選）
- 我的紀錄的月份鎖定（當月可改、跨月不可改）
- 匯出 Excel 的格式、公式、檔名與現有範例一致
- 管理後台密碼保護：沒帶或帶錯 `adminPin` 一律拒絕，所有 `adminXxx` action 都要擋
- 管理後台紀錄編輯：跨月紀錄可改、可改欄位比工程師版完整（含日期/角色/單價）
- 案場名稱/出發地/抵達地/途經 為必填，抵達地不可被前端竄改（後端仍應以送出的字串直接存，不做地址正確性驗證，比照信任制設計）
- Sheet 欄位遷移：既有 26 欄的正式資料在新增路線欄位後不遺失、不錯位
