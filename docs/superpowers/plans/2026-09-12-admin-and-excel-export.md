# 管理後台、月結算 Excel 匯出、案場與路線佐證 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Wei 能透過密碼保護的管理後台檢視/編輯/刪除任一筆派工紀錄、新增固定費用、維護工程師與案場名單、調整單價設定，並一鍵產出跟現有 Excel 範例格式相同的月結算報表；同時讓派工表單新增「案場/出發地/抵達地/途經」欄位，為之後產生 Google Maps 路線佐證 PDF 預存資料。

**Architecture:** 延續既有 GAS + Google Sheet + 靜態前端架構。新增 `shared/adminRecords.js`（管理後台紀錄編輯與固定費用的純函式）、`shared/exportBuilder.js`（Excel 匯出資料整理與公式產生的純函式），兩者皆可用 Node 測試；`gas/Code.js` 新增一批 `adminXxx` handler（皆需密碼驗證）與 `exportMonthlyExcel`；`frontend/form.html` 新增路線欄位；新增 `frontend/admin.html` 管理後台頁面。Excel 匯出改用「建立一份全新的暫存試算表、寫入格式化資料、匯出成 xlsx、刪除暫存檔」的做法，避免多分頁試算表匯出單一分頁時的已知不確定性。

**Tech Stack:** 與既有專案相同（原生 JavaScript、`node:test`、Google Apps Script V8、Google Sheets、GitHub Pages）。

**Spec:** `docs/superpowers/specs/2026-09-12-dispatch-payment-tracker-design.md`

**範圍說明：** 此計畫涵蓋原規格的子系統 ②（管理後台）與 ③（月結算 Excel 匯出），加上執行過程中新提出、與管理後台高度相關而併入的「案場管理」與「路線佐證欄位」。**不包含**「Google Maps 路線 PDF 的實際產生」——那一步由 Wei 事後請 Claude 用瀏覽器自動化批次處理，系統本身只負責存資料（見 spec「路線佐證 PDF」一節）。

## Global Constraints

- 管理密碼存在 GAS 的 **Script Properties**（key: `ADMIN_PIN`），不寫在 Sheet 或前端程式碼裡；每一個 `adminXxx` action 在 handler 開頭都要驗證 `payload.adminPin` 等於該值，不對就丟出 `Error('密碼錯誤')`（現有 `doPost` 的 try/catch 會自動轉成 `{ok:false,error:'密碼錯誤'}` 回應，不需要額外處理）
- 管理後台可編輯的欄位比工程師版「我的紀錄」更完整：日期、DispatchNo、Project、角色、單價都可改（工程師版仍維持只能改時間/加班/交通/住宿）
- 工程師／案場名單一律「軟停用」（`啟用中` 布林值切換），不做硬刪除，保留歷史
- 新增的 `案場名稱`／`出發地`／`抵達地`／`途經` 為派工表單必填欄位；`PDF網址` 欄位由送出流程留空，之後由人工（Wei／Claude）填入，不需要對應的更新 API
- `HEADERS`（`shared/schema.js`）新增 5 個欄位，附加在既有 26 欄之後（AA~AE），**既有正式環境的 `SDI_紀錄`／`HDC_紀錄` 分頁已有資料，不能重建，只能用一次性遷移函式在後面補欄位**
- 金額欄位一律不四捨五入，維持原始浮點數（沿用既有規則）
- Excel 匯出的計算欄位一律用儲存格公式（如 `=G5/1.05`），不得寫死計算後的數字，以維持與原始範例一致的「打開後可看到公式、可手動微調」特性
- Excel 匯出的資料列版面與既有兩份範例檔完全一致：A 欄留白、B~U 共 20 個資料欄依原順序（No./Dispatch No./Project/Date/Personal/Unit Price/Tax excluded/Departure Time/start/end/hours/days/Overtime Hour/Overtime pay/mark up/sub total/Transportation/Lodging/sub total/Amount）。此版面是獨立於內部 `HEADERS` 常數的另一套欄位配置，兩者欄位順序不同、互不影響
- 加班費在匯出檔案裡也要是公式（`=(H{row}/8)*N{row}*1.34`），比原始範例（人工填死數字、無公式連動）更透明，這是刻意的改善，不是缺陷

---

## File Structure

```
dispatch-payment-tracker/
├── shared/
│   ├── schema.js        [MODIFY] HEADERS 新增 5 欄
│   ├── dispatch.js       [MODIFY] buildDispatchRecord 支援路線欄位
│   ├── adminRecords.js   [NEW] 管理後台紀錄編輯／固定費用純函式
│   └── exportBuilder.js  [NEW] Excel 匯出資料整理與公式純函式
├── gas/
│   └── Code.js           [MODIFY] 大量新增 adminXxx handlers、exportMonthlyExcel、getSites、遷移函式
├── tests/
│   ├── schema.test.js    [MODIFY]
│   ├── dispatch.test.js  [MODIFY]
│   ├── adminRecords.test.js [NEW]
│   └── exportBuilder.test.js [NEW]
└── frontend/
    ├── form.html          [MODIFY] 新增案場/出發地/抵達地/途經欄位
    ├── adminShared.js     [NEW] 管理後台專用的 callApi 包裝（自動帶 adminPin）
    └── admin.html         [NEW] 管理後台頁面
```

---

### Task 1: `shared/schema.js` — HEADERS 新增路線欄位

**Files:**
- Modify: `shared/schema.js`
- Modify: `tests/schema.test.js`

**Interfaces:**
- Produces: 更新後的 `HEADERS`（31 個欄位）供本計畫所有其他任務使用

- [ ] **Step 1: 修改測試**

把 `tests/schema.test.js` 裡「HEADERS 包含全部 26 個欄位」的測試改成：

```js
test('HEADERS 包含全部 31 個欄位，且順序固定', () => {
  assert.deepEqual(schema.HEADERS, [
    'RecordID', '建立時間', '修改時間', '類型', 'No', 'DispatchNo', 'Project', 'Date',
    '姓名', '角色', '單價', '稅前單價', '出發時間', '上班時間', '下班時間', '工時', '天數',
    '加班時數', '加班費', 'mark up (5%)', '服務費小計', '交通費', '住宿費', '交通住宿小計',
    '合計', '狀態', '案場名稱', '出發地', '抵達地', '途經', 'PDF網址'
  ]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（HEADERS 陣列長度不符）

- [ ] **Step 3: 修改 `shared/schema.js` 的 HEADERS**

```js
var HEADERS = [
  'RecordID', '建立時間', '修改時間', '類型', 'No', 'DispatchNo', 'Project', 'Date',
  '姓名', '角色', '單價', '稅前單價', '出發時間', '上班時間', '下班時間', '工時', '天數',
  '加班時數', '加班費', 'mark up (5%)', '服務費小計', '交通費', '住宿費', '交通住宿小計',
  '合計', '狀態', '案場名稱', '出發地', '抵達地', '途經', 'PDF網址'
];
```

（`rowObjectToArray` 函式不需要改，它本來就是通用的。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/schema.js tests/schema.test.js
git commit -m "feat: HEADERS 新增案場/路線佐證欄位"
```

---

### Task 2: `shared/dispatch.js` — buildDispatchRecord 支援路線欄位

**Files:**
- Modify: `shared/dispatch.js`
- Modify: `tests/dispatch.test.js`

**Interfaces:**
- Consumes: `HEADERS`（Task 1，欄位鍵名需完全對應）
- Produces: `buildDispatchRecord` 現在也接受並驗證 `input.siteName`／`input.origin`／`input.destination`／`input.viaPoints`，新增 `assertNonEmptyString_`（不需要 export，內部使用）

- [ ] **Step 1: 加測試**

在 `tests/dispatch.test.js` 找到 `'buildDispatchRecord：SDI 新增派工，工時 8 小時，比對現有範例金額'` 這個測試，把它的 `input` 物件加上三個新欄位（`newProjectText` 那行下面加）：

```js
    siteName: '龍井廠', origin: '中華系統整合股份有限公司國分辦公室', destination: '台泥龍井廠',
```

並在該測試的斷言區塊最後加入：

```js
  assert.equal(result.record['案場名稱'], '龍井廠');
  assert.equal(result.record['出發地'], '中華系統整合股份有限公司國分辦公室');
  assert.equal(result.record['抵達地'], '台泥龍井廠');
  assert.equal(result.record['途經'], '');
```

同樣地，找到其他呼叫 `buildDispatchRecord` 的測試（加入既有派工、needsConfirmation、HDC 沒選角色…等），在它們的 `input` 物件都加上 `siteName: '龍井廠', origin: '公司', destination: '工地'` 這三個欄位（讓現有測試不會因為新增的必填驗證而失敗）。

再新增以下測試：

```js
test('buildDispatchRecord：途經多個地點會用 | 串接', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地', viaPoints: ['休息站A', '休息站B'],
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  const result = dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z');
  assert.equal(result.record['途經'], '休息站A | 休息站B');
});

test('buildDispatchRecord：不給途經時預設為空字串', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  const result = dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z');
  assert.equal(result.record['途經'], '');
});

test('buildDispatchRecord：缺少案場名稱要丟錯誤', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /案場名稱/);
});

test('buildDispatchRecord：缺少抵達地要丟錯誤', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /抵達地/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（新欄位相關斷言失敗、新測試找不到對應驗證邏輯）

- [ ] **Step 3: 修改 `shared/dispatch.js`**

在既有的 `assertFiniteNumber_` 函式後面加入：

```js
function assertNonEmptyString_(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('欄位 ' + fieldName + ' 不可為空');
  }
}
```

在 `buildDispatchRecord` 函式裡，找到這三行：

```js
  assertFiniteNumber_(input.overtimeHours, '加班時數');
  assertFiniteNumber_(input.transportation, '交通費');
  assertFiniteNumber_(input.lodging, '住宿費');
```

在它們後面加上：

```js
  assertNonEmptyString_(input.siteName, '案場名稱');
  assertNonEmptyString_(input.origin, '出發地');
  assertNonEmptyString_(input.destination, '抵達地');
```

找到 `var record = { ... '狀態': '正常' };` 這個物件字面量，在 `'狀態': '正常'` 後面加上逗號並新增：

```js
    '案場名稱': input.siteName,
    '出發地': input.origin,
    '抵達地': input.destination,
    '途經': (input.viaPoints || []).join(' | '),
    'PDF網址': ''
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/dispatch.js tests/dispatch.test.js
git commit -m "feat: buildDispatchRecord 支援案場/出發地/抵達地/途經"
```

---

### Task 3: `shared/adminRecords.js` — buildFixedFeeRecord

**Files:**
- Create: `shared/adminRecords.js`
- Create: `tests/adminRecords.test.js`

**Interfaces:**
- Consumes: 無（固定費用列不需要金額公式計算）
- Produces: `buildFixedFeeRecord(input, nowISO)` 供 Task 8（`handleAdminAddFixedFee`）使用

- [ ] **Step 1: 寫失敗測試**

`tests/adminRecords.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const adminRecords = require('../shared/adminRecords.js');

test('buildFixedFeeRecord：建立固定費用列，計算欄位皆留空', () => {
  const result = adminRecords.buildFixedFeeRecord(
    { date: '2026-07-30', description: 'Warehouse fee(Zhongli)', amount: 124210 },
    '2026-07-30T10:00:00.000Z'
  );
  assert.equal(result['類型'], '固定費用');
  assert.equal(result['DispatchNo'], 'X');
  assert.equal(result['Date'], '2026-07-30');
  assert.equal(result['姓名'], 'Warehouse fee(Zhongli)');
  assert.equal(result['合計'], 124210);
  assert.equal(result['狀態'], '正常');
  assert.equal(result['建立時間'], '2026-07-30T10:00:00.000Z');
  assert.equal(result['服務費小計'], '');
  assert.equal(result['案場名稱'], '');
});

test('buildFixedFeeRecord：缺少日期要丟錯誤', () => {
  assert.throws(() => adminRecords.buildFixedFeeRecord(
    { date: '', description: 'test', amount: 100 }, '2026-07-30T10:00:00.000Z'
  ), /Date/);
});

test('buildFixedFeeRecord：缺少說明要丟錯誤', () => {
  assert.throws(() => adminRecords.buildFixedFeeRecord(
    { date: '2026-07-30', description: '', amount: 100 }, '2026-07-30T10:00:00.000Z'
  ), /費用說明/);
});

test('buildFixedFeeRecord：金額不是數字要丟錯誤', () => {
  assert.throws(() => adminRecords.buildFixedFeeRecord(
    { date: '2026-07-30', description: 'test', amount: 'abc' }, '2026-07-30T10:00:00.000Z'
  ), /金額/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`Cannot find module '../shared/adminRecords.js'`）

- [ ] **Step 3: 實作 `shared/adminRecords.js`**

```js
function assertFiniteNumber_(value, fieldName) {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error('欄位 ' + fieldName + ' 必須是有效數字');
  }
}

function assertNonEmptyString_(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('欄位 ' + fieldName + ' 不可為空');
  }
}

function buildFixedFeeRecord(input, nowISO) {
  assertNonEmptyString_(input.date, 'Date');
  assertNonEmptyString_(input.description, '費用說明');
  assertFiniteNumber_(input.amount, '金額');

  return {
    'RecordID': null,
    '建立時間': nowISO,
    '修改時間': nowISO,
    '類型': '固定費用',
    'No': null,
    'DispatchNo': 'X',
    'Project': '',
    'Date': input.date,
    '姓名': input.description,
    '角色': '',
    '單價': '',
    '稅前單價': '',
    '出發時間': '',
    '上班時間': '',
    '下班時間': '',
    '工時': '',
    '天數': '',
    '加班時數': '',
    '加班費': '',
    'mark up (5%)': '',
    '服務費小計': '',
    '交通費': '',
    '住宿費': '',
    '交通住宿小計': '',
    '合計': input.amount,
    '狀態': '正常',
    '案場名稱': '',
    '出發地': '',
    '抵達地': '',
    '途經': '',
    'PDF網址': ''
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildFixedFeeRecord: buildFixedFeeRecord };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/adminRecords.js tests/adminRecords.test.js
git commit -m "feat: 固定費用列建構純函式"
```

---

### Task 4: `shared/adminRecords.js` — buildAdminRecordUpdate

**Files:**
- Modify: `shared/adminRecords.js`
- Modify: `tests/adminRecords.test.js`

**Interfaces:**
- Consumes: `taxExcluded, hoursFromTimes, days, isStandardHours, overtimePay, markup, serviceSubtotal, transportLodgingSubtotal, amount`（`shared/calc.js`）
- Produces: `buildAdminRecordUpdate(record, edits, nowISO)` 供 Task 9（`handleAdminUpdateRecord`）使用

- [ ] **Step 1: 加測試**

在 `tests/adminRecords.test.js` 最上面加入 dual-mode 依賴載入需要的 require（測試檔本身不用管，純函式檔案自己處理），並在檔案最後加入：

```js
test('buildAdminRecordUpdate：固定費用列直接合併 edits，不重新計算', () => {
  const record = {
    '類型': '固定費用', '姓名': 'Warehouse fee(Zhongli)', 'Date': '2026-07-30', '合計': 124210, '修改時間': '2026-07-30T10:00:00.000Z'
  };
  const result = adminRecords.buildAdminRecordUpdate(record, { amount: 999, description: '改過的說明' }, '2026-08-01T00:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['修改時間'], '2026-08-01T00:00:00.000Z');
  assert.equal(result.record.amount, 999);
});

test('buildAdminRecordUpdate：派工列可以改日期/派工單號/角色/單價並重新試算', () => {
  const record = {
    '類型': '派工', 'Date': '2026-07-07', 'DispatchNo': 'PR26A014-260707-A', 'Project': '測試案',
    '姓名': '林哲宇', '角色': 'Engineer', '單價': 9200,
    '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  const result = adminRecords.buildAdminRecordUpdate(record, {
    date: '2026-07-08', dispatchNo: 'PR26A014-260708-A', project: '改過的案場', role: 'Worker', unitPrice: 7000
  }, '2026-08-01T00:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['Date'], '2026-07-08');
  assert.equal(result.record['DispatchNo'], 'PR26A014-260708-A');
  assert.equal(result.record['Project'], '改過的案場');
  assert.equal(result.record['角色'], 'Worker');
  assert.equal(result.record['單價'], 7000);
  assert.ok(Math.abs(result.record['稅前單價'] - 6666.666666666666) < 1e-6);
  assert.equal(result.record['修改時間'], '2026-08-01T00:00:00.000Z');
});

test('buildAdminRecordUpdate：改成非 4/8 小時且未強制時回傳 needsConfirmation', () => {
  const record = {
    '類型': '派工', 'Date': '2026-07-07', 'DispatchNo': 'PR26A014-260707-A', 'Project': '測試案',
    '姓名': '林哲宇', '角色': 'Engineer', '單價': 9200,
    '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  const result = adminRecords.buildAdminRecordUpdate(record, { endTime: '15:00' }, '2026-08-01T00:00:00.000Z');
  assert.equal(result.ok, false);
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.hours, 6);
});

test('buildAdminRecordUpdate：單價改成非數字要丟錯誤', () => {
  const record = {
    '類型': '派工', 'Date': '2026-07-07', 'DispatchNo': 'PR26A014-260707-A', 'Project': '測試案',
    '姓名': '林哲宇', '角色': 'Engineer', '單價': 9200,
    '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  assert.throws(() => adminRecords.buildAdminRecordUpdate(record, { unitPrice: 'abc' }, '2026-08-01T00:00:00.000Z'), /單價/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`adminRecords.buildAdminRecordUpdate is not a function`）

- [ ] **Step 3: 實作**

在 `shared/adminRecords.js` 最上面（`function assertFiniteNumber_` 之前）加入依賴載入：

```js
if (typeof require !== 'undefined') {
  var calcLib = require('./calc.js');
  var taxExcluded = calcLib.taxExcluded;
  var hoursFromTimes = calcLib.hoursFromTimes;
  var days = calcLib.days;
  var isStandardHours = calcLib.isStandardHours;
  var overtimePay = calcLib.overtimePay;
  var markup = calcLib.markup;
  var serviceSubtotal = calcLib.serviceSubtotal;
  var transportLodgingSubtotal = calcLib.transportLodgingSubtotal;
  var amount = calcLib.amount;
}
```

在 `buildFixedFeeRecord` 函式後面加入：

```js
function buildAdminRecordUpdate(record, edits, nowISO) {
  if (record['類型'] === '固定費用') {
    var updatedFee = Object.assign({}, record, edits, { '修改時間': nowISO });
    return { ok: true, needsConfirmation: false, record: updatedFee };
  }

  if (edits.overtimeHours !== undefined) assertFiniteNumber_(edits.overtimeHours, '加班時數');
  if (edits.transportation !== undefined) assertFiniteNumber_(edits.transportation, '交通費');
  if (edits.lodging !== undefined) assertFiniteNumber_(edits.lodging, '住宿費');
  if (edits.unitPrice !== undefined) assertFiniteNumber_(edits.unitPrice, '單價');

  var merged = Object.assign({}, record);
  if (edits.date !== undefined) merged['Date'] = edits.date;
  if (edits.dispatchNo !== undefined) merged['DispatchNo'] = edits.dispatchNo;
  if (edits.project !== undefined) merged['Project'] = edits.project;
  if (edits.role !== undefined) merged['角色'] = edits.role;
  if (edits.unitPrice !== undefined) merged['單價'] = edits.unitPrice;
  if (edits.departureTime !== undefined) merged['出發時間'] = edits.departureTime;
  if (edits.startTime !== undefined) merged['上班時間'] = edits.startTime;
  if (edits.endTime !== undefined) merged['下班時間'] = edits.endTime;
  if (edits.overtimeHours !== undefined) merged['加班時數'] = edits.overtimeHours;
  if (edits.transportation !== undefined) merged['交通費'] = edits.transportation;
  if (edits.lodging !== undefined) merged['住宿費'] = edits.lodging;

  var hours = hoursFromTimes(merged['上班時間'], merged['下班時間']);
  if (!isStandardHours(hours) && !edits.forceSubmit) {
    return { ok: false, needsConfirmation: true, hours: hours };
  }

  var dayCount = days(hours);
  var rate = merged['單價'];
  var taxEx = taxExcluded(rate);
  var ot = overtimePay(rate, merged['加班時數']);
  var mk = markup(rate, dayCount);
  var svcSubtotal = serviceSubtotal(rate, dayCount, merged['加班時數']);
  var tlSubtotal = transportLodgingSubtotal(merged['交通費'], merged['住宿費']);
  var total = amount(svcSubtotal, tlSubtotal);

  var updated = Object.assign({}, merged, {
    '稅前單價': taxEx,
    '工時': hours,
    '天數': dayCount,
    '加班費': ot,
    'mark up (5%)': mk,
    '服務費小計': svcSubtotal,
    '交通住宿小計': tlSubtotal,
    '合計': total,
    '修改時間': nowISO
  });

  return { ok: true, needsConfirmation: false, record: updated };
}
```

把檔案最後的 `module.exports` 改成：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildFixedFeeRecord: buildFixedFeeRecord,
    buildAdminRecordUpdate: buildAdminRecordUpdate
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/adminRecords.js tests/adminRecords.test.js
git commit -m "feat: 管理後台紀錄編輯純函式（支援跨欄位修改）"
```

---

### Task 5: `shared/exportBuilder.js` — filterRecordsForExport

**Files:**
- Create: `shared/exportBuilder.js`
- Create: `tests/exportBuilder.test.js`

**Interfaces:**
- Produces: `filterRecordsForExport(records, yearMonth)` 供 Task 6、11 使用

- [ ] **Step 1: 寫失敗測試**

`tests/exportBuilder.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const exportBuilder = require('../shared/exportBuilder.js');

test('filterRecordsForExport：只留下狀態正常、當月的紀錄，並依日期排序', () => {
  const records = [
    { 'Date': '2026-07-10', '狀態': '正常', '姓名': 'B' },
    { 'Date': '2026-07-05', '狀態': '正常', '姓名': 'A' },
    { 'Date': '2026-07-20', '狀態': '已刪除', '姓名': 'C' },
    { 'Date': '2026-08-01', '狀態': '正常', '姓名': 'D' }
  ];
  const result = exportBuilder.filterRecordsForExport(records, '2026-07');
  assert.equal(result.length, 2);
  assert.equal(result[0]['姓名'], 'A');
  assert.equal(result[1]['姓名'], 'B');
});

test('filterRecordsForExport：找不到符合的紀錄回傳空陣列', () => {
  const result = exportBuilder.filterRecordsForExport([{ 'Date': '2026-07-10', '狀態': '正常' }], '2026-09');
  assert.deepEqual(result, []);
});

test('filterRecordsForExport：不修改傳入的原始陣列', () => {
  const records = [
    { 'Date': '2026-07-10', '狀態': '正常' },
    { 'Date': '2026-07-05', '狀態': '正常' }
  ];
  const original = records.slice();
  exportBuilder.filterRecordsForExport(records, '2026-07');
  assert.deepEqual(records, original);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`Cannot find module '../shared/exportBuilder.js'`）

- [ ] **Step 3: 實作 `shared/exportBuilder.js`**

```js
function filterRecordsForExport(records, yearMonth) {
  return records
    .filter(function (r) { return r['狀態'] === '正常' && r['Date'].slice(0, 7) === yearMonth; })
    .slice()
    .sort(function (a, b) {
      if (a['Date'] < b['Date']) return -1;
      if (a['Date'] > b['Date']) return 1;
      return 0;
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { filterRecordsForExport: filterRecordsForExport };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/exportBuilder.js tests/exportBuilder.test.js
git commit -m "feat: 匯出紀錄篩選/排序純函式"
```

---

### Task 6: `shared/exportBuilder.js` — buildExportRows

**Files:**
- Modify: `shared/exportBuilder.js`
- Modify: `tests/exportBuilder.test.js`

**Interfaces:**
- Produces: `buildExportRows(records, startRow)` 供 Task 11（`handleExportMonthlyExcel`）使用

**重要**：這個函式的欄位配置（A~U 共 21 格）是獨立於 `HEADERS` 的另一套版面，對應現有 Excel 範例的欄位順序，不要跟內部 Sheet 的 `HEADERS` 搞混。

- [ ] **Step 1: 加測試**

在 `tests/exportBuilder.test.js` 最後加入（測試數值直接取自真實的 Samsung SDI 範例檔第一列資料，已驗證過）：

```js
test('buildExportRows：派工列產生正確的公式與數值（比對真實 SDI 範例）', () => {
  const records = [{
    'DispatchNo': 'PR26A014-260707-A', 'Project': '260707-(NHOA) Bigbattery', 'Date': '2026-07-07',
    '姓名': '林哲宇', '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0, '類型': '派工'
  }];
  const rows = exportBuilder.buildExportRows(records, 5);
  assert.deepEqual(rows, [[
    '', 1, 'PR26A014-260707-A', '260707-(NHOA) Bigbattery', '2026-07-07', '林哲宇', 9200,
    '=G5/1.05', '17:24', '08:30', '17:15', '=HOUR(K5-J5)', '=L5/8', 0,
    '=(H5/8)*N5*1.34', '=H5*0.05*M5', '=(H5*M5)+P5+O5', 3495, 0, '=R5+S5', '=Q5+T5'
  ]]);
});

test('buildExportRows：第二筆的公式要用正確的列號', () => {
  const records = [
    { 'DispatchNo': 'A', 'Project': 'p1', 'Date': '2026-07-07', '姓名': 'x', '單價': 9200, '出發時間': '', '上班時間': '08:00', '下班時間': '17:00', '加班時數': 0, '交通費': 0, '住宿費': 0, '類型': '派工' },
    { 'DispatchNo': 'B', 'Project': 'p2', 'Date': '2026-07-08', '姓名': 'y', '單價': 9200, '出發時間': '', '上班時間': '08:00', '下班時間': '17:00', '加班時數': 0, '交通費': 0, '住宿費': 0, '類型': '派工' }
  ];
  const rows = exportBuilder.buildExportRows(records, 5);
  assert.equal(rows[1][1], 2);
  assert.equal(rows[1][7], '=G6/1.05');
  assert.equal(rows[1][11], '=HOUR(K6-J6)');
});

test('buildExportRows：固定費用列只有 Amount 有值，其餘欄位留空', () => {
  const records = [{
    'Date': '2026-07-30', '姓名': 'Warehouse fee(Zhongli)', '合計': 124210, '類型': '固定費用'
  }];
  const rows = exportBuilder.buildExportRows(records, 12);
  assert.deepEqual(rows, [[
    '', 1, 'X', '', '2026-07-30', 'Warehouse fee(Zhongli)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 124210
  ]]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`exportBuilder.buildExportRows is not a function`）

- [ ] **Step 3: 實作**

在 `shared/exportBuilder.js` 的 `filterRecordsForExport` 後面加入：

```js
function buildExportRows(records, startRow) {
  return records.map(function (record, index) {
    var r = startRow + index;
    var no = index + 1;
    if (record['類型'] === '固定費用') {
      return ['', no, 'X', '', record['Date'], record['姓名'], '', '', '', '', '', '', '', '', '', '', '', '', '', '', record['合計']];
    }
    return [
      '',
      no,
      record['DispatchNo'],
      record['Project'],
      record['Date'],
      record['姓名'],
      record['單價'],
      '=G' + r + '/1.05',
      record['出發時間'],
      record['上班時間'],
      record['下班時間'],
      '=HOUR(K' + r + '-J' + r + ')',
      '=L' + r + '/8',
      record['加班時數'],
      '=(H' + r + '/8)*N' + r + '*1.34',
      '=H' + r + '*0.05*M' + r,
      '=(H' + r + '*M' + r + ')+P' + r + '+O' + r,
      record['交通費'],
      record['住宿費'],
      '=R' + r + '+S' + r,
      '=Q' + r + '+T' + r
    ];
  });
}
```

把 `module.exports` 改成：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterRecordsForExport: filterRecordsForExport,
    buildExportRows: buildExportRows
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/exportBuilder.js tests/exportBuilder.test.js
git commit -m "feat: 匯出資料列與公式產生純函式"
```

---

### Task 7: `shared/exportBuilder.js` — buildFooterRows

**Files:**
- Modify: `shared/exportBuilder.js`
- Modify: `tests/exportBuilder.test.js`

**Interfaces:**
- Produces: `buildFooterRows(startRow, lastDataRow, exchangeRate, yearMonth)` 供 Task 11 使用

- [ ] **Step 1: 加測試**

在 `tests/exportBuilder.test.js` 最後加入：

```js
test('buildFooterRows：Total/匯率/Final Total 公式與備註文字正確', () => {
  const rows = exportBuilder.buildFooterRows(5, 11, 31.62, '2026-07');
  assert.equal(rows.length, 4);
  assert.equal(rows[0][1], 'Total');
  assert.equal(rows[0][20], '=SUM(U5:U11)');
  assert.equal(rows[1][1], 'EXCHANGE RATE (USD TO NTD)');
  assert.equal(rows[1][20], 31.62);
  assert.equal(rows[2][1], 'FINAL TOTAL');
  assert.equal(rows[2][20], '=U12/U13');
  assert.equal(
    rows[3][1],
    '1. The exchange rate is based on the average daily exchange rate between USD and TWD from 2026/7/1 to 2026/7/31, as provided by the Bank of Taiwan（台灣銀行）.'
  );
});

test('buildFooterRows：2 月份（非閏年）備註文字用 28 號', () => {
  const rows = exportBuilder.buildFooterRows(5, 5, 31, '2026-02');
  assert.match(rows[3][1], /2026\/2\/1 to 2026\/2\/28/);
});

test('buildFooterRows：每列長度都是 21（與資料列版面一致）', () => {
  const rows = exportBuilder.buildFooterRows(5, 5, 31, '2026-02');
  rows.forEach(function (row) { assert.equal(row.length, 21); });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`exportBuilder.buildFooterRows is not a function`）

- [ ] **Step 3: 實作**

在 `shared/exportBuilder.js` 的 `buildExportRows` 後面加入：

```js
function lastDayOfMonth_(yearMonth) {
  var parts = yearMonth.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildFooterRows(startRow, lastDataRow, exchangeRate, yearMonth) {
  var totalRow = lastDataRow + 1;
  var rateRow = lastDataRow + 2;
  var parts = yearMonth.split('-');
  var year = parts[0];
  var month = parseInt(parts[1], 10);
  var lastDay = lastDayOfMonth_(yearMonth);
  var noteText = '1. The exchange rate is based on the average daily exchange rate between USD and TWD from ' +
    year + '/' + month + '/1 to ' + year + '/' + month + '/' + lastDay +
    ', as provided by the Bank of Taiwan（台灣銀行）.';

  function blankRow() {
    var row = [];
    for (var i = 0; i < 21; i++) row.push('');
    return row;
  }

  var total = blankRow();
  total[1] = 'Total';
  total[20] = '=SUM(U' + startRow + ':U' + lastDataRow + ')';

  var rate = blankRow();
  rate[1] = 'EXCHANGE RATE (USD TO NTD)';
  rate[20] = exchangeRate;

  var final = blankRow();
  final[1] = 'FINAL TOTAL';
  final[20] = '=U' + totalRow + '/U' + rateRow;

  var note = blankRow();
  note[1] = noteText;

  return [total, rate, final, note];
}
```

把 `module.exports` 改成：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterRecordsForExport: filterRecordsForExport,
    buildExportRows: buildExportRows,
    buildFooterRows: buildFooterRows
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/exportBuilder.js tests/exportBuilder.test.js
git commit -m "feat: 匯出頁尾（Total/匯率/Final Total/備註）純函式"
```

---

### Task 8: `gas/Code.js` — 管理密碼驗證機制

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Produces: `assertAdminPin_(payload)` 供本計畫所有 `adminXxx` handler 使用

此任務為 GAS-only 程式碼，無法自動化測試，改用手動驗證。

- [ ] **Step 1: 加入密碼驗證函式**

在 `gas/Code.js` 的 `jsonResponse_` 函式之前加入：

```js
function assertAdminPin_(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!expected || payload.adminPin !== expected) {
    throw new Error('密碼錯誤');
  }
}
```

- [ ] **Step 2: 手動驗證**

1. 把這段程式碼加進 Apps Script 編輯器的 `Code.gs`（先不用重新部署，下個任務會用到）
2. 在 Apps Script 編輯器左側「專案設定」（齒輪圖示）→ 指令碼屬性 → 新增屬性：鍵 `ADMIN_PIN`，值填一組你要用的管理密碼（例如 6 位數字），儲存
3. 記下這組密碼，之後管理後台登入要用

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: 管理後台密碼驗證機制 assertAdminPin_"
```

---

### Task 9: `gas/Code.js` — 案場/工程師/紀錄 Sheet 遷移與 setupSheets 更新

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `HEADERS`（Task 1，新的 31 欄版本）
- Produces: `migrateAddRouteColumns()`、更新後的 `setupSheets()`（新增建立 `{SDI|HDC}_案場` 分頁）

- [ ] **Step 1: 修改 `setupSheets()`**

找到 `setupSheets` 函式裡的這段：

```js
  ['SDI', 'HDC'].forEach(function (project) {
    getOrCreateSheet_(ss, project + '_紀錄', HEADERS);
    getOrCreateSheet_(ss, project + '_工程師', ['姓名', '啟用中']);
  });
```

改成：

```js
  ['SDI', 'HDC'].forEach(function (project) {
    getOrCreateSheet_(ss, project + '_紀錄', HEADERS);
    getOrCreateSheet_(ss, project + '_工程師', ['姓名', '啟用中']);
    getOrCreateSheet_(ss, project + '_案場', ['案場名稱', '地址', '啟用中']);
  });
```

（`HEADERS` 已經是 Task 1 更新後的 31 欄版本，所以這行不用另外改；這只影響全新建立的分頁。）

- [ ] **Step 2: 新增一次性遷移函式**

在 `setupSheets` 函式後面加入：

```js
function migrateAddRouteColumns() {
  var ss = getSpreadsheet_();
  var newColumns = ['案場名稱', '出發地', '抵達地', '途經', 'PDF網址'];
  ['SDI', 'HDC'].forEach(function (project) {
    var sheet = ss.getSheetByName(project + '_紀錄');
    var lastCol = sheet.getLastColumn();
    var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    newColumns.forEach(function (col) {
      if (existingHeaders.indexOf(col) === -1) {
        lastCol = lastCol + 1;
        sheet.getRange(1, lastCol).setValue(col);
      }
    });
    var sitesSheet = ss.getSheetByName(project + '_案場');
    if (!sitesSheet) {
      ss.insertSheet(project + '_案場').appendRow(['案場名稱', '地址', '啟用中']);
    }
  });
  Logger.log('migrateAddRouteColumns 完成');
}
```

（用 `indexOf` 檢查避免重複執行時重複新增欄位；用 `getSheetByName` 檢查避免案場分頁已存在時重複建立。）

- [ ] **Step 3: 手動驗證**

1. 把改好的 `Code.gs` 貼到 Apps Script 編輯器
2. 執行 `migrateAddRouteColumns` 函式（下拉選單選它、按執行）
3. 打開 Google Sheet，確認：
   - `SDI_紀錄`／`HDC_紀錄` 的第 1 列（表頭）在 Z 欄後面（AA~AE）出現了「案場名稱、出發地、抵達地、途經、PDF網址」5 個新欄位
   - 既有資料列完全沒有被搬動或清空
   - 新增了 `SDI_案場`／`HDC_案場` 兩個空白分頁，表頭為「案場名稱、地址、啟用中」
4. 再執行一次 `migrateAddRouteColumns`，確認不會重複新增欄位或分頁（冪等）

- [ ] **Step 4: Commit**

```bash
git add gas/Code.js
git commit -m "feat: 案場分頁與路線欄位一次性遷移函式"
```

---

### Task 10: `gas/Code.js` — getSites（公開）

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Produces: `handleGetSites(payload)`，並在 `doPost` 的 `handlers` 加入 `getSites`

- [ ] **Step 1: 實作**

在 `gas/Code.js` 的 `handleGetEngineers` 函式後面加入：

```js
function handleGetSites(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_案場');
  var rows = readSheetAsObjects_(sheet);
  var sites = rows
    .filter(function (r) { return r['啟用中'] === true || r['啟用中'] === 'TRUE'; })
    .map(function (r) { return { name: r['案場名稱'], address: r['地址'] }; });
  return { ok: true, sites: sites };
}
```

把 `doPost` 裡的 `handlers` 物件加入 `getSites: handleGetSites,`（放在 `getOpenDispatches` 那行後面即可）。

- [ ] **Step 2: 手動驗證**

1. 到 Google Sheet 的 `SDI_案場` 分頁手動加一列：`龍井廠 / 台泥龍井廠地址 / TRUE`
2. 重新部署（New version）
3. 執行：
   ```bash
   curl -sL -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"getSites","project":"SDI"}' \
     "部署網址"
   ```
   Expected: `{"ok":true,"sites":[{"name":"龍井廠","address":"台泥龍井廠地址"}]}`

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: getSites action（案場下拉選單來源）"
```

---

### Task 11: `gas/Code.js` — adminGetRecords / adminUpdateRecord / adminDeleteRecord

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `buildAdminRecordUpdate`（Task 4）、`assertAdminPin_`（Task 8）
- Produces: `handleAdminGetRecords`、`handleAdminUpdateRecord`、`handleAdminDeleteRecord`，並加入 `handlers` map

- [ ] **Step 1: 實作**

在 `gas/Code.js` 的 `handleDeleteMyRecord` 函式後面加入：

```js
function handleAdminGetRecords(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    r['Date'] = formatDateForCompare_(r['Date']);
    r['出發時間'] = formatTimeForCompare_(r['出發時間']);
    r['上班時間'] = formatTimeForCompare_(r['上班時間']);
    r['下班時間'] = formatTimeForCompare_(r['下班時間']);
    return r;
  });
  var filtered = records.filter(function (r) {
    if (!payload.includeDeleted && r['狀態'] === '已刪除') return false;
    if (payload.yearMonth && r['Date'].slice(0, 7) !== payload.yearMonth) return false;
    if (payload.name && r['姓名'] !== payload.name) return false;
    return true;
  });
  filtered.sort(function (a, b) {
    if (a['Date'] < b['Date']) return -1;
    if (a['Date'] > b['Date']) return 1;
    return 0;
  });
  return { ok: true, records: filtered };
}

function handleAdminUpdateRecord(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到紀錄：' + payload.recordId };
  }
  var record = rowToRecordObject_(sheet, rowIndex);
  var result = buildAdminRecordUpdate(record, payload.edits || {}, new Date().toISOString());
  if (!result.ok) {
    return result;
  }
  var rowArray = rowObjectToArray(HEADERS, result.record);
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowArray]);
  return { ok: true };
}

function handleAdminDeleteRecord(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到紀錄：' + payload.recordId };
  }
  var statusColumnIndex = HEADERS.indexOf('狀態') + 1;
  var modifiedColumnIndex = HEADERS.indexOf('修改時間') + 1;
  sheet.getRange(rowIndex, statusColumnIndex).setValue('已刪除');
  sheet.getRange(rowIndex, modifiedColumnIndex).setValue(new Date().toISOString());
  return { ok: true };
}
```

把 `doPost` 裡的 `handlers` 物件加入：

```js
    adminGetRecords: handleAdminGetRecords,
    adminUpdateRecord: handleAdminUpdateRecord,
    adminDeleteRecord: handleAdminDeleteRecord,
```

- [ ] **Step 2: 手動驗證**

1. 重新部署
2. 執行（帶正確 `adminPin`，換成你在 Task 8 設定的值）：
   ```bash
   curl -sL -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"adminGetRecords","project":"SDI","adminPin":"你的密碼"}' \
     "部署網址"
   ```
   Expected: `{"ok":true,"records":[...]}`，含所有正常狀態的紀錄
3. 帶錯密碼執行同一個 action，Expected: `{"ok":false,"error":"密碼錯誤"}`
4. 取一個 RecordID 執行 `adminUpdateRecord`，`edits` 帶 `{"date":"2026-07-08"}`，確認 Sheet 裡該列的 Date 真的改了
5. 執行 `adminDeleteRecord`，確認該列狀態變成「已刪除」，且 `adminGetRecords`（不帶 `includeDeleted`）不會再列出它，帶 `"includeDeleted":true` 才會看到

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: adminGetRecords/adminUpdateRecord/adminDeleteRecord actions"
```

---

### Task 12: `gas/Code.js` — adminAddFixedFee

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `buildFixedFeeRecord`（Task 3）
- Produces: `handleAdminAddFixedFee`，加入 `handlers` map

- [ ] **Step 1: 實作**

```js
function handleAdminAddFixedFee(payload) {
  assertAdminPin_(payload);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var record = buildFixedFeeRecord(payload.input, new Date().toISOString());
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.project + '_紀錄');
    record['RecordID'] = Utilities.getUuid();
    record['No'] = sheet.getLastRow();
    var rowArray = rowObjectToArray(HEADERS, record);
    sheet.appendRow(rowArray);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
```

加入 `handlers`：`adminAddFixedFee: handleAdminAddFixedFee,`

- [ ] **Step 2: 手動驗證**

重新部署後執行：
```bash
curl -sL -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"adminAddFixedFee","project":"SDI","adminPin":"你的密碼","input":{"date":"2026-09-30","description":"Warehouse fee(Test)","amount":5000}}' \
  "部署網址"
```
Expected: `{"ok":true}`，且 `SDI_紀錄` 多一列類型=固定費用、DispatchNo=X、合計=5000 的資料

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: adminAddFixedFee action"
```

---

### Task 13: `gas/Code.js` — adminGetSettings / adminUpdateSettings

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `parseSettingsRows`（`shared/settings.js`）
- Produces: `handleAdminGetSettings`、`handleAdminUpdateSettings`，加入 `handlers` map

- [ ] **Step 1: 實作**

```js
function handleAdminGetSettings(payload) {
  assertAdminPin_(payload);
  return { ok: true, settings: getSettings_() };
}

function handleAdminUpdateSettings(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('設定');
  var s = payload.settings;
  sheet.getRange(2, 1, 2, 4).setValues([
    ['SDI', s.SDI.prefix, s.SDI.rates.Engineer, s.SDI.rates.Worker],
    ['HDC', s.HDC.prefix, s.HDC.rates.Engineer, s.HDC.rates.Worker]
  ]);
  return { ok: true };
}
```

加入 `handlers`：`adminGetSettings: handleAdminGetSettings, adminUpdateSettings: handleAdminUpdateSettings,`

- [ ] **Step 2: 手動驗證**

1. 執行 `adminGetSettings`，確認回傳目前的 SDI/HDC 前綴與單價
2. 執行 `adminUpdateSettings`，帶入：
   ```json
   {"action":"adminUpdateSettings","adminPin":"你的密碼","settings":{"SDI":{"prefix":"PR26A014","rates":{"Engineer":9200,"Worker":7000}},"HDC":{"prefix":"PR26A014","rates":{"Engineer":10200,"Worker":8800}}}}
   ```
   確認 `設定` 分頁內容不變（因為填的是原值），再故意改一個數字驗證真的會更新
3. **驗證完後務必把數值改回正確的原值**（9200/7000/10200/8800），避免影響正式派工試算

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: adminGetSettings/adminUpdateSettings actions"
```

---

### Task 14: `gas/Code.js` — adminGetEngineers / adminAddEngineer / adminToggleEngineer

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Produces: 三個 handler，加入 `handlers` map

- [ ] **Step 1: 實作**

```js
function handleAdminGetEngineers(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rows = readSheetAsObjects_(sheet);
  var engineers = rows.map(function (r) {
    return { name: r['姓名'], active: r['啟用中'] === true || r['啟用中'] === 'TRUE' };
  });
  return { ok: true, engineers: engineers };
}

function findNameRowIndex_(sheet, nameColumnHeader, name) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var col = headers.indexOf(nameColumnHeader);
  for (var i = 1; i < values.length; i++) {
    if (values[i][col] === name) return i + 1;
  }
  return -1;
}

function handleAdminAddEngineer(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rowIndex = findNameRowIndex_(sheet, '姓名', payload.name);
  if (rowIndex === -1) {
    sheet.appendRow([payload.name, true]);
  } else {
    sheet.getRange(rowIndex, 2).setValue(true);
  }
  return { ok: true };
}

function handleAdminToggleEngineer(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rowIndex = findNameRowIndex_(sheet, '姓名', payload.name);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到工程師：' + payload.name };
  }
  sheet.getRange(rowIndex, 2).setValue(!!payload.active);
  return { ok: true };
}
```

加入 `handlers`：`adminGetEngineers: handleAdminGetEngineers, adminAddEngineer: handleAdminAddEngineer, adminToggleEngineer: handleAdminToggleEngineer,`

- [ ] **Step 2: 手動驗證**

1. `adminGetEngineers` 確認回傳目前 8 位工程師且 `active:true`
2. `adminAddEngineer` 帶一個新姓名，確認 Sheet 多一列且啟用中=TRUE
3. `adminToggleEngineer` 把某人 `active:false`，確認 Sheet 該列變 FALSE，且 `getEngineers`（公開版）不再列出這個人
4. 再 `adminToggleEngineer` 設回 `true`，確認能重新啟用（不會產生重複列）

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: 工程師名單管理 actions"
```

---

### Task 15: `gas/Code.js` — adminGetSites / adminAddSite / adminToggleSite

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Produces: 三個 handler，加入 `handlers` map（與 Task 14 邏輯完全對應，差別是多一個「地址」欄位）

- [ ] **Step 1: 實作**

```js
function handleAdminGetSites(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_案場');
  var rows = readSheetAsObjects_(sheet);
  var sites = rows.map(function (r) {
    return { name: r['案場名稱'], address: r['地址'], active: r['啟用中'] === true || r['啟用中'] === 'TRUE' };
  });
  return { ok: true, sites: sites };
}

function handleAdminAddSite(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_案場');
  var rowIndex = findNameRowIndex_(sheet, '案場名稱', payload.name);
  if (rowIndex === -1) {
    sheet.appendRow([payload.name, payload.address, true]);
  } else {
    sheet.getRange(rowIndex, 2).setValue(payload.address);
    sheet.getRange(rowIndex, 3).setValue(true);
  }
  return { ok: true };
}

function handleAdminToggleSite(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_案場');
  var rowIndex = findNameRowIndex_(sheet, '案場名稱', payload.name);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到案場：' + payload.name };
  }
  sheet.getRange(rowIndex, 3).setValue(!!payload.active);
  return { ok: true };
}
```

加入 `handlers`：`adminGetSites: handleAdminGetSites, adminAddSite: handleAdminAddSite, adminToggleSite: handleAdminToggleSite,`

- [ ] **Step 2: 手動驗證**

同 Task 14 的驗證方式，針對案場（`adminAddSite` 要多帶 `address` 欄位）。驗證完後確認 `getSites`（公開版，Task 10）能正確看到新增/停用的結果。

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: 案場名單管理 actions"
```

---

### Task 16: `gas/Code.js` — exportMonthlyExcel

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `filterRecordsForExport, buildExportRows, buildFooterRows`（Task 5-7）
- Produces: `writeExportHeaderRows_`、`handleExportMonthlyExcel`，加入 `handlers` map

**技術說明**：為了確保匯出的 xlsx 只包含一個乾淨的分頁（不會把整份共用試算表的其他分頁一起匯出），這裡改用「建立一份全新的獨立試算表」的做法，寫完資料後匯出、再把這份暫存試算表丟進垃圾桶，而不是在共用試算表裡開暫存分頁再匯出——後者對單一分頁的 xlsx 匯出行為不夠明確可靠。這個做法會用到 `SpreadsheetApp.create()` 與 `DriveApp`，Apps Script 會自動判斷所需權限，**第一次執行這個功能時很可能會跳出新的「需要授權」畫面**，屬於預期行為，同意即可。

- [ ] **Step 1: 實作**

在 `gas/Code.js` 加入表頭建置函式（可放在 `setupSheets` 附近）：

```js
function writeExportHeaderRows_(sheet) {
  sheet.getRange(2, 2).setValue('No.');
  sheet.getRange(2, 3).setValue('Dispatch No.');
  sheet.getRange(2, 4).setValue('Project');
  sheet.getRange(2, 5).setValue('Date');
  sheet.getRange(2, 6).setValue('service expence');
  sheet.getRange(2, 18).setValue('Lodging and Transport Expenses');
  sheet.getRange(2, 21).setValue('Amount');
  sheet.getRange(3, 6).setValue('Personal');
  sheet.getRange(3, 7).setValue('Unit Price');
  sheet.getRange(3, 8).setValue('Tax  excluded');
  sheet.getRange(3, 9).setValue('Departure Time');
  sheet.getRange(3, 10).setValue('Work Time');
  sheet.getRange(3, 14).setValue('Overtime\n (Hour)');
  sheet.getRange(3, 15).setValue('Overtime pay');
  sheet.getRange(3, 16).setValue('mark up\n(5%)');
  sheet.getRange(3, 17).setValue('sub total');
  sheet.getRange(3, 18).setValue('Transportation');
  sheet.getRange(3, 19).setValue('Lodging');
  sheet.getRange(3, 20).setValue('sub total');
  sheet.getRange(4, 10).setValue('start');
  sheet.getRange(4, 11).setValue('end');
  sheet.getRange(4, 12).setValue('hours');
  sheet.getRange(4, 13).setValue('days');

  sheet.getRange(2, 2, 3, 1).merge();
  sheet.getRange(2, 3, 3, 1).merge();
  sheet.getRange(2, 4, 3, 1).merge();
  sheet.getRange(2, 5, 3, 1).merge();
  sheet.getRange(2, 6, 1, 12).merge();
  sheet.getRange(3, 6, 2, 1).merge();
  sheet.getRange(3, 7, 2, 1).merge();
  sheet.getRange(3, 8, 2, 1).merge();
  sheet.getRange(3, 9, 2, 1).merge();
  sheet.getRange(3, 10, 1, 4).merge();
  sheet.getRange(3, 14, 2, 1).merge();
  sheet.getRange(3, 15, 2, 1).merge();
  sheet.getRange(3, 16, 2, 1).merge();
  sheet.getRange(3, 17, 2, 1).merge();
  sheet.getRange(2, 18, 1, 3).merge();
  sheet.getRange(3, 18, 2, 1).merge();
  sheet.getRange(3, 19, 2, 1).merge();
  sheet.getRange(3, 20, 2, 1).merge();
  sheet.getRange(2, 21, 3, 1).merge();
}
```

加入匯出主流程：

```js
function handleExportMonthlyExcel(payload) {
  assertAdminPin_(payload);
  var mainSs = getSpreadsheet_();
  var sourceSheet = mainSs.getSheetByName(payload.project + '_紀錄');
  var allRecords = readSheetAsObjects_(sourceSheet).map(function (r) {
    r['Date'] = formatDateForCompare_(r['Date']);
    r['出發時間'] = formatTimeForCompare_(r['出發時間']);
    r['上班時間'] = formatTimeForCompare_(r['上班時間']);
    r['下班時間'] = formatTimeForCompare_(r['下班時間']);
    return r;
  });
  var filtered = filterRecordsForExport(allRecords, payload.yearMonth);

  var yy = payload.yearMonth.slice(2, 4);
  var mm = payload.yearMonth.slice(5, 7);
  var filename = payload.project + ' dispatch payment detail_CSI' + yy + mm + '.xlsx';

  var tempSpreadsheet = SpreadsheetApp.create(filename.replace('.xlsx', ''));
  var exportSheet = tempSpreadsheet.getSheets()[0];
  exportSheet.setName(yy + mm + ' summary');
  writeExportHeaderRows_(exportSheet);

  var startRow = 5;
  if (filtered.length > 0) {
    var dataRows = buildExportRows(filtered, startRow);
    exportSheet.getRange(startRow, 1, dataRows.length, 21).setValues(dataRows);
  }
  var lastDataRow = startRow + Math.max(filtered.length, 1) - 1;
  var footerRows = buildFooterRows(startRow, lastDataRow, payload.exchangeRate, payload.yearMonth);
  exportSheet.getRange(lastDataRow + 1, 1, footerRows.length, 21).setValues(footerRows);

  SpreadsheetApp.flush();

  var tempId = tempSpreadsheet.getId();
  var exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempId + '/export?format=xlsx';
  var response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  var base64 = Utilities.base64Encode(response.getBlob().getBytes());

  DriveApp.getFileById(tempId).setTrashed(true);

  return { ok: true, filename: filename, base64: base64 };
}
```

加入 `handlers`：`exportMonthlyExcel: handleExportMonthlyExcel,`

- [ ] **Step 2: 手動驗證**

1. 重新部署
2. 執行：
   ```bash
   curl -sL -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"exportMonthlyExcel","project":"SDI","adminPin":"你的密碼","yearMonth":"2026-07","exchangeRate":31.62}' \
     "部署網址" -o /tmp/export_response.json
   ```
3. 用小工具（例如 `node -e "const r=require('/tmp/export_response.json'); require('fs').writeFileSync('/tmp/out.xlsx', Buffer.from(r.base64,'base64'))"`）把 `base64` 還原成檔案，打開確認：
   - 表頭多層結構、合併儲存格跟現有範例一致
   - 資料列的公式（H/L/M/O/P/Q/T/U 欄）都是公式而非數字，數值算出來正確
   - 最後的 Total/EXCHANGE RATE/FINAL TOTAL/備註列正確
   - 檔名格式正確
4. 到 Google Drive 確認暫存試算表檔案已經在垃圾桶（不是還留在「我的雲端硬碟」裡）

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: exportMonthlyExcel action"
```

---

### Task 17: `frontend/form.html` — 新增案場/出發地/抵達地/途經欄位

**Files:**
- Modify: `frontend/form.html`

**Interfaces:**
- Consumes: `getSites` action（Task 10）
- Produces: 送出時 `buildInputPayload` 帶上 `siteName`／`origin`／`destination`／`viaPoints`

- [ ] **Step 1: 修改 HTML**

在 `<label>住宿費</label>` 那個欄位區塊後面（`<div id="confirmHoursBox">` 之前）加入：

```html
      <label>案場名稱</label>
      <select id="siteSelect" required></select>

      <label>出發地</label>
      <input type="text" id="originInput" required>

      <label>抵達地</label>
      <input type="text" id="destinationInput" readonly required>

      <label>途經（選填）</label>
      <div id="viaPointsContainer"></div>
      <button type="button" id="addViaPointBtn">+ 新增經由點</button>
```

- [ ] **Step 2: 修改 JavaScript**

在 `init()` 函式裡，`callApi('getEngineers', ...)` 那段後面加入：

```js
      callApi('getSites', { project: project }).then(function (res) {
        const select = document.getElementById('siteSelect');
        (res.sites || []).forEach(function (site) {
          const opt = document.createElement('option');
          opt.value = site.name;
          opt.dataset.address = site.address;
          opt.textContent = site.name;
          select.appendChild(opt);
        });
        if (select.options.length > 0) {
          document.getElementById('destinationInput').value = select.options[0].dataset.address;
        }
      });

      document.getElementById('originInput').value = '中華系統整合股份有限公司國分辦公室';

      document.getElementById('siteSelect').addEventListener('change', function () {
        const opt = this.options[this.selectedIndex];
        document.getElementById('destinationInput').value = opt ? opt.dataset.address : '';
        schedulePreview();
      });

      document.getElementById('addViaPointBtn').addEventListener('click', function () {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'viaPointInput';
        input.placeholder = '經由點地址';
        document.getElementById('viaPointsContainer').appendChild(input);
      });
```

在 `buildInputPayload` 函式的 `return { ... }` 物件裡，`newProjectText` 那行後面加入：

```js
        siteName: document.getElementById('siteSelect').value,
        origin: document.getElementById('originInput').value,
        destination: document.getElementById('destinationInput').value,
        viaPoints: Array.from(document.querySelectorAll('.viaPointInput'))
          .map(function (el) { return el.value.trim(); })
          .filter(function (v) { return v !== ''; }),
```

在 `onSubmit` 成功分支（`document.getElementById('dispatchChoices').innerHTML = '';` 那行附近）加入清空途經欄位：

```js
          document.getElementById('viaPointsContainer').innerHTML = '';
```

- [ ] **Step 3: 手動驗證**

1. 把 `frontend/form.html` 用本機伺服器打開（`python3 -m http.server` 之類），確認：
   - 案場下拉正確載入（用 Task 10 加的測試案場）
   - 選案場後「抵達地」自動帶入且無法編輯
   - 「出發地」預填公司地址且可修改
   - 按「+ 新增經由點」能一直加新的輸入框
2. 填完整張表單並送出，到 Google Sheet 確認新增的一列有正確填入案場名稱/出發地/抵達地/途經（途經用 `|` 串接）

- [ ] **Step 4: Commit**

```bash
git add frontend/form.html
git commit -m "feat: 派工表單新增案場/出發地/抵達地/途經欄位"
```

---

### Task 18: `frontend/adminShared.js` 與 `admin.html` — 登入與紀錄管理

**Files:**
- Create: `frontend/adminShared.js`
- Create: `frontend/admin.html`

**Interfaces:**
- Consumes: `callApi`（`frontend/shared.js`，不修改）、`adminGetRecords`／`adminUpdateRecord`／`adminDeleteRecord`（Task 11）

- [ ] **Step 1: 建立 `frontend/adminShared.js`**

```js
function getAdminPin() {
  return sessionStorage.getItem('adminPin') || '';
}

function setAdminPin(pin) {
  sessionStorage.setItem('adminPin', pin);
}

function clearAdminPin() {
  sessionStorage.removeItem('adminPin');
}

function adminCallApi(action, payload) {
  return callApi(action, Object.assign({ adminPin: getAdminPin() }, payload || {})).then(function (res) {
    if (!res.ok && res.error === '密碼錯誤') {
      clearAdminPin();
      alert('密碼錯誤，請重新輸入');
      location.reload();
    }
    return res;
  });
}
```

- [ ] **Step 2: 建立 `frontend/admin.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>管理後台</title>
<style>
  body { font-family: -apple-system, "PingFang TC", sans-serif; background: #f5f5f7; margin: 0; padding: 24px 16px; }
  .card { max-width: 960px; margin: 0 auto 24px; background: #fff; border-radius: 14px; padding: 24px; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 24px; }
  label { display: inline-block; margin-right: 12px; font-weight: 600; }
  input, select { padding: 6px; border-radius: 8px; border: 1px solid #ccc; margin-right: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border-bottom: 1px solid #eee; padding: 6px; text-align: left; font-size: 13px; }
  #loginGate { max-width: 320px; margin: 80px auto; text-align: center; }
</style>
</head>
<body>
  <div id="loginGate">
    <h1>管理後台登入</h1>
    <input type="password" id="pinInput" placeholder="請輸入管理密碼">
    <button id="loginBtn">登入</button>
  </div>

  <div id="adminContent" style="display:none;">
    <div class="card">
      <h1>紀錄管理</h1>
      <label>專案</label>
      <select id="recProject"><option value="SDI">SDI</option><option value="HDC">HDC</option></select>
      <label>年月</label>
      <input type="month" id="recYearMonth">
      <label>姓名</label>
      <input type="text" id="recName" placeholder="留空查全部">
      <label><input type="checkbox" id="recIncludeDeleted"> 顯示已刪除</label>
      <button id="recSearchBtn">查詢</button>

      <table id="recTable">
        <thead>
          <tr><th>日期</th><th>DispatchNo</th><th>Project</th><th>姓名</th><th>角色</th><th>單價</th><th>合計</th><th>狀態</th><th></th></tr>
        </thead>
        <tbody id="recBody"></tbody>
      </table>
    </div>
  </div>

  <script src="shared.js"></script>
  <script src="adminShared.js"></script>
  <script>
    let currentRecords = [];

    document.addEventListener('DOMContentLoaded', function () {
      if (getAdminPin()) {
        showAdminContent();
      }
      document.getElementById('loginBtn').addEventListener('click', function () {
        setAdminPin(document.getElementById('pinInput').value);
        showAdminContent();
      });
      document.getElementById('recSearchBtn').addEventListener('click', searchRecords);

      const now = new Date();
      document.getElementById('recYearMonth').value =
        now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    });

    function showAdminContent() {
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('adminContent').style.display = 'block';
      searchRecords();
    }

    function searchRecords() {
      const project = document.getElementById('recProject').value;
      const yearMonth = document.getElementById('recYearMonth').value;
      const name = document.getElementById('recName').value;
      const includeDeleted = document.getElementById('recIncludeDeleted').checked;
      adminCallApi('adminGetRecords', { project: project, yearMonth: yearMonth, name: name, includeDeleted: includeDeleted })
        .then(function (res) {
          if (!res.ok) { alert('查詢失敗：' + res.error); return; }
          currentRecords = res.records || [];
          renderRecordTable();
        })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    }

    function renderRecordTable() {
      const body = document.getElementById('recBody');
      body.innerHTML = '';
      currentRecords.forEach(function (r) {
        const tr = document.createElement('tr');
        const cells = [r['Date'], r['DispatchNo'], r['Project'], r['姓名'], r['角色'], r['單價'], r['合計'], r['狀態']];
        cells.forEach(function (value) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        const actionTd = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.textContent = '編輯';
        editBtn.addEventListener('click', function () { showEditForm(tr, r); });
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '刪除';
        deleteBtn.addEventListener('click', function () { deleteRecord(r); });
        actionTd.appendChild(editBtn);
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);
        body.appendChild(tr);
      });
    }

    function showEditForm(tr, record) {
      const editRow = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      const fields = [
        { key: 'date', label: '日期', value: record['Date'] },
        { key: 'dispatchNo', label: 'DispatchNo', value: record['DispatchNo'] },
        { key: 'project', label: 'Project', value: record['Project'] },
        { key: 'role', label: '角色', value: record['角色'] },
        { key: 'unitPrice', label: '單價', value: record['單價'] },
        { key: 'transportation', label: '交通費', value: record['交通費'] },
        { key: 'lodging', label: '住宿費', value: record['住宿費'] },
        { key: 'overtimeHours', label: '加班時數', value: record['加班時數'] }
      ];
      const inputs = {};
      fields.forEach(function (f) {
        const label = document.createElement('label');
        label.textContent = f.label;
        const input = document.createElement('input');
        input.value = f.value;
        inputs[f.key] = input;
        td.appendChild(label);
        td.appendChild(input);
      });
      const saveBtn = document.createElement('button');
      saveBtn.textContent = '儲存';
      saveBtn.addEventListener('click', function () {
        const edits = {
          date: inputs.date.value,
          dispatchNo: inputs.dispatchNo.value,
          project: inputs.project.value,
          role: inputs.role.value,
          unitPrice: Number(inputs.unitPrice.value),
          transportation: Number(inputs.transportation.value),
          lodging: Number(inputs.lodging.value),
          overtimeHours: Number(inputs.overtimeHours.value)
        };
        saveRecordEdit(record, edits, editRow);
      });
      td.appendChild(saveBtn);
      editRow.appendChild(td);
      tr.parentNode.insertBefore(editRow, tr.nextSibling);
    }

    function saveRecordEdit(record, edits, editRow) {
      const project = document.getElementById('recProject').value;
      adminCallApi('adminUpdateRecord', { project: project, recordId: record['RecordID'], edits: edits })
        .then(function (res) {
          if (res.ok) {
            editRow.remove();
            searchRecords();
          } else if (res.needsConfirmation) {
            if (confirm('工時計算為 ' + res.hours + ' 小時，通常應為 4 或 8 小時，是否仍要送出？')) {
              edits.forceSubmit = true;
              saveRecordEdit(record, edits, editRow);
            }
          } else {
            alert('儲存失敗：' + res.error);
          }
        })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    }

    function deleteRecord(record) {
      if (!confirm('確定要刪除這筆紀錄嗎？')) return;
      const project = document.getElementById('recProject').value;
      adminCallApi('adminDeleteRecord', { project: project, recordId: record['RecordID'] })
        .then(function (res) {
          if (res.ok) { searchRecords(); } else { alert('刪除失敗：' + res.error); }
        })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: 手動驗證**

1. 用本機伺服器打開 `admin.html`，輸入 Task 8 設定的密碼登入
2. 確認能查到紀錄、編輯後金額重新試算、刪除後從列表消失（`includeDeleted` 打勾能看到）
3. 故意輸入錯誤密碼，確認被導回登入畫面

- [ ] **Step 4: Commit**

```bash
git add frontend/adminShared.js frontend/admin.html
git commit -m "feat: 管理後台登入與紀錄管理頁"
```

---

### Task 19: `admin.html` — 固定費用／工程師／案場名單維護

**Files:**
- Modify: `frontend/admin.html`

**Interfaces:**
- Consumes: `adminAddFixedFee`（Task 12）、`adminGetEngineers`／`adminAddEngineer`／`adminToggleEngineer`（Task 14）、`adminGetSites`／`adminAddSite`／`adminToggleSite`（Task 15）

- [ ] **Step 1: 在 `#adminContent` 裡、紀錄管理的 `<div class="card">` 後面加入三個區塊**

```html
    <div class="card">
      <h1>新增固定費用</h1>
      <label>專案</label>
      <select id="feeProject"><option value="SDI">SDI</option><option value="HDC">HDC</option></select>
      <label>日期</label>
      <input type="date" id="feeDate">
      <label>說明</label>
      <input type="text" id="feeDescription">
      <label>金額</label>
      <input type="number" id="feeAmount">
      <button id="feeAddBtn">新增</button>
    </div>

    <div class="card">
      <h1>工程師名單</h1>
      <select id="engProject"><option value="SDI">SDI</option><option value="HDC">HDC</option></select>
      <button id="engRefreshBtn">重新整理</button>
      <input type="text" id="engNewName" placeholder="新增姓名">
      <button id="engAddBtn">新增</button>
      <table id="engTable"><tbody id="engBody"></tbody></table>
    </div>

    <div class="card">
      <h1>案場名單</h1>
      <select id="siteProject"><option value="SDI">SDI</option><option value="HDC">HDC</option></select>
      <button id="siteRefreshBtn">重新整理</button>
      <input type="text" id="siteNewName" placeholder="案場名稱">
      <input type="text" id="siteNewAddress" placeholder="地址">
      <button id="siteAddBtn">新增</button>
      <table id="siteTable"><tbody id="siteBody"></tbody></table>
    </div>
```

- [ ] **Step 2: 在 `<script>` 區塊裡加入對應邏輯**

```js
    document.getElementById('feeAddBtn').addEventListener('click', function () {
      const input = {
        date: document.getElementById('feeDate').value,
        description: document.getElementById('feeDescription').value,
        amount: Number(document.getElementById('feeAmount').value)
      };
      adminCallApi('adminAddFixedFee', { project: document.getElementById('feeProject').value, input: input })
        .then(function (res) {
          if (res.ok) { alert('已新增'); } else { alert('新增失敗：' + res.error); }
        })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    });

    document.getElementById('engRefreshBtn').addEventListener('click', refreshEngineers);
    document.getElementById('engAddBtn').addEventListener('click', function () {
      const name = document.getElementById('engNewName').value.trim();
      if (!name) return;
      adminCallApi('adminAddEngineer', { project: document.getElementById('engProject').value, name: name })
        .then(function () { document.getElementById('engNewName').value = ''; refreshEngineers(); })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    });

    function refreshEngineers() {
      adminCallApi('adminGetEngineers', { project: document.getElementById('engProject').value })
        .then(function (res) {
          const body = document.getElementById('engBody');
          body.innerHTML = '';
          (res.engineers || []).forEach(function (e) {
            const tr = document.createElement('tr');
            const nameTd = document.createElement('td');
            nameTd.textContent = e.name;
            const toggleTd = document.createElement('td');
            const btn = document.createElement('button');
            btn.textContent = e.active ? '停用' : '啟用';
            btn.addEventListener('click', function () {
              adminCallApi('adminToggleEngineer', { project: document.getElementById('engProject').value, name: e.name, active: !e.active })
                .then(refreshEngineers);
            });
            toggleTd.appendChild(btn);
            tr.appendChild(nameTd);
            tr.appendChild(toggleTd);
            body.appendChild(tr);
          });
        });
    }

    document.getElementById('siteRefreshBtn').addEventListener('click', refreshSites);
    document.getElementById('siteAddBtn').addEventListener('click', function () {
      const name = document.getElementById('siteNewName').value.trim();
      const address = document.getElementById('siteNewAddress').value.trim();
      if (!name || !address) return;
      adminCallApi('adminAddSite', { project: document.getElementById('siteProject').value, name: name, address: address })
        .then(function () {
          document.getElementById('siteNewName').value = '';
          document.getElementById('siteNewAddress').value = '';
          refreshSites();
        })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    });

    function refreshSites() {
      adminCallApi('adminGetSites', { project: document.getElementById('siteProject').value })
        .then(function (res) {
          const body = document.getElementById('siteBody');
          body.innerHTML = '';
          (res.sites || []).forEach(function (s) {
            const tr = document.createElement('tr');
            const nameTd = document.createElement('td');
            nameTd.textContent = s.name + '（' + s.address + '）';
            const toggleTd = document.createElement('td');
            const btn = document.createElement('button');
            btn.textContent = s.active ? '停用' : '啟用';
            btn.addEventListener('click', function () {
              adminCallApi('adminToggleSite', { project: document.getElementById('siteProject').value, name: s.name, active: !s.active })
                .then(refreshSites);
            });
            toggleTd.appendChild(btn);
            tr.appendChild(nameTd);
            tr.appendChild(toggleTd);
            body.appendChild(tr);
          });
        });
    }
```

在 `showAdminContent()` 函式裡，`searchRecords();` 後面加上 `refreshEngineers(); refreshSites();`。

- [ ] **Step 3: 手動驗證**

1. 新增一筆固定費用，到 Sheet 確認資料正確
2. 工程師/案場名單都能新增、切換啟用停用，且畫面即時更新
3. 停用某工程師後，重新整理 `form.html`，確認下拉選單不再顯示他

- [ ] **Step 4: Commit**

```bash
git add frontend/admin.html
git commit -m "feat: 管理後台固定費用/工程師/案場維護區塊"
```

---

### Task 20: `admin.html` — 設定維護與月結算匯出

**Files:**
- Modify: `frontend/admin.html`

**Interfaces:**
- Consumes: `adminGetSettings`／`adminUpdateSettings`（Task 13）、`exportMonthlyExcel`（Task 16）

- [ ] **Step 1: 加入 HTML 區塊**

```html
    <div class="card">
      <h1>單價設定</h1>
      <div id="settingsForm"></div>
      <button id="settingsSaveBtn">儲存設定</button>
    </div>

    <div class="card">
      <h1>月結算 Excel 匯出</h1>
      <label>專案</label>
      <select id="exportProject"><option value="SDI">SDI</option><option value="HDC">HDC</option></select>
      <label>年月</label>
      <input type="month" id="exportYearMonth">
      <label>美金匯率</label>
      <input type="number" id="exportRate" step="0.01">
      <button id="exportBtn">產生 Excel</button>
    </div>
```

- [ ] **Step 2: 加入 JavaScript**

```js
    let currentSettings = null;
    function refreshSettings() {
      adminCallApi('adminGetSettings', {}).then(function (res) {
        currentSettings = res.settings;
        const container = document.getElementById('settingsForm');
        container.innerHTML = '';
        ['SDI', 'HDC'].forEach(function (project) {
          const div = document.createElement('div');
          div.innerHTML =
            '<strong>' + project + '</strong> ' +
            '前綴 <input type="text" id="prefix_' + project + '" value="' + currentSettings[project].prefix + '"> ' +
            'Engineer <input type="number" id="eng_' + project + '" value="' + currentSettings[project].rates.Engineer + '"> ' +
            'Worker <input type="number" id="worker_' + project + '" value="' + currentSettings[project].rates.Worker + '">';
          container.appendChild(div);
        });
      });
    }

    document.getElementById('settingsSaveBtn').addEventListener('click', function () {
      const settings = {
        SDI: {
          prefix: document.getElementById('prefix_SDI').value,
          rates: { Engineer: Number(document.getElementById('eng_SDI').value), Worker: Number(document.getElementById('worker_SDI').value) }
        },
        HDC: {
          prefix: document.getElementById('prefix_HDC').value,
          rates: { Engineer: Number(document.getElementById('eng_HDC').value), Worker: Number(document.getElementById('worker_HDC').value) }
        }
      };
      adminCallApi('adminUpdateSettings', { settings: settings })
        .then(function (res) { alert(res.ok ? '已儲存' : '儲存失敗：' + res.error); })
        .catch(function (err) { alert('連線異常，請稍後再試一次：' + err.message); });
    });

    document.getElementById('exportBtn').addEventListener('click', function () {
      const btn = this;
      btn.disabled = true;
      adminCallApi('exportMonthlyExcel', {
        project: document.getElementById('exportProject').value,
        yearMonth: document.getElementById('exportYearMonth').value,
        exchangeRate: Number(document.getElementById('exportRate').value)
      }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { alert('匯出失敗：' + res.error); return; }
        const byteChars = atob(res.base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
      }).catch(function (err) {
        btn.disabled = false;
        alert('連線異常，請稍後再試一次：' + err.message);
      });
    });
```

在 `showAdminContent()` 裡加上 `refreshSettings();`。

- [ ] **Step 3: 手動驗證**

1. 設定區塊能正確顯示/儲存 SDI、HDC 的前綴與單價
2. 選一個有資料的年月按「產生 Excel」，確認瀏覽器觸發下載，檔案能正常打開且內容正確

- [ ] **Step 4: Commit**

```bash
git add frontend/admin.html
git commit -m "feat: 管理後台設定維護與月結算 Excel 匯出區塊"
```

---

### Task 21: 端對端手動驗證與部署

**Files:**
- 無新檔案

- [ ] **Step 1: 完整驗證清單**

1. 管理密碼保護：所有 `adminXxx` action 不帶/帶錯密碼都要被拒絕
2. 紀錄管理：查詢、編輯（含改角色/單價/日期）、軟刪除、跨月紀錄也能改
3. 固定費用新增：金額正確進帳
4. 工程師/案場名單：新增、啟用/停用即時反映到公開版下拉選單
5. 設定維護：改前綴/單價後，之後新送出的派工紀錄要用新單價試算
6. 月結算 Excel 匯出：格式、公式、金額、檔名都與現有範例一致；匯出後暫存試算表已進垃圾桶
7. 派工表單新欄位：案場/出發地/抵達地/途經都正確存進 Sheet；缺任一必填欄位時 `previewRecord`／`submitRecord` 要擋下並給清楚錯誤訊息
8. 既有資料遷移：跑過 `migrateAddRouteColumns()` 後，舊資料完全沒有遺失或錯位

- [ ] **Step 2: 更新前端部署（GitHub Pages）**

```bash
git subtree split --prefix=frontend origin/admin-and-excel-export -b gh-pages-update
git push origin gh-pages-update:gh-pages --force
git branch -D gh-pages-update
```

（`main` 分支合併後記得改用 `origin/main` 而不是 `origin/admin-and-excel-export`；上面指令只是本計畫分支尚未合併前的暫時測試用法，正式更新 `gh-pages` 應在 PR merge 進 main 之後執行，用 main 當來源。）

- [ ] **Step 3: 記錄管理密碼**

把 Task 8 設定的 `ADMIN_PIN` 交給 Wei，並提醒之後有需要重新部署 Apps Script 時，這個 Script Property 不會因為重新貼程式碼而消失（Script Properties 跟程式碼是分開儲存的）。

---

## Self-Review 紀錄

- **spec 覆蓋率**：spec 的「管理後台安全機制」對應 Task 8；「管理後台」功能清單對應 Task 11、12、14、15、19；「設定」維護對應 Task 13、20；「月結算 Excel 匯出」對應 Task 16、20；「案場管理」對應 Task 9、10、15、19；「路線佐證」欄位對應 Task 1、2、17。
- **Placeholder 掃描**：已確認無 TBD/TODO，所有步驟皆附完整程式碼；`ADMIN_PIN` 值由使用者自訂屬於合理留白，已在 Task 8 手動驗證步驟中明確說明如何設定。
- **型別/命名一致性**：`HEADERS`、`buildFixedFeeRecord`、`buildAdminRecordUpdate`、`filterRecordsForExport`、`buildExportRows`、`buildFooterRows`、`assertAdminPin_` 等函式名稱與物件鍵值在各任務間保持一致；`gas/Code.js` 的 `handlers` map 每個任務都是「加入新的一行」而非整個取代，避免任務間互相覆蓋彼此加入的 action。
- **與既有程式碼的相容性**：Task 2 修改 `buildDispatchRecord` 的簽章（新增必填欄位）會影響所有既有呼叫端——已在 Task 2 內明確列出要同步修改的既有測試案例，避免遺漏導致既有測試變紅。
