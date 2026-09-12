# 派工核心資料層與填寫流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓工程師能免登入上網填寫 SDI／HDC 每日派工紀錄（含雙人派工的新增/加入機制、金額自動試算），並能查詢/編輯/刪除自己當月的紀錄，資料存進 Google Sheet。

**Architecture:** Google Apps Script Web App（單一 `doPost` 路由）+ Google Sheet 當資料庫 + GitHub Pages 靜態前端。金額與派工編號的核心邏輯寫成不依賴 `SpreadsheetApp` 的純函式（`shared/*.js`），用 Node 內建測試機直接單元測試；`gas/Code.js` 只負責讀寫 Sheet 並呼叫這些純函式，靠手動在 Apps Script 編輯器執行驗證。

**Tech Stack:** 原生 JavaScript（無框架）、Node.js 內建 `node:test` / `node:assert`、Google Apps Script V8 執行環境、Google Sheets、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-09-12-dispatch-payment-tracker-design.md`

**範圍說明：** spec 涵蓋三個子系統（①核心資料層與填寫流程 ②管理後台 ③月結算 Excel 匯出）。本計畫只做 ①，做完即可讓工程師實際上網記錄派工並自行查詢/編輯/刪除當月資料。②③ 待本計畫驗收後另立計畫。

## Global Constraints

- Dispatch No. 格式：`{前綴}-{YYMMDD}-{字母}`，前綴預設 `PR26A014`（存在『設定』分頁，不寫死在程式碼）
- SDI 角色/單價：Engineer 9200／Worker 7000；「新增派工」固定 Engineer，「加入既有派工」固定 Worker，使用者不可自選
- HDC 角色/單價：Engineer 10200／Worker 8800；角色一律由使用者自選（新增或加入都要選）
- 加班費公式：`稅前單價 ÷ 8 × 加班時數 × 1.34`
- mark up 公式：`稅前單價 × 5% × 天數`
- 稅前單價公式：`單價 ÷ 1.05`
- 工時公式：`HOUR(下班時間 − 上班時間)`，取整數小時；非 4 或 8 小時時必須跳出確認視窗，使用者需明確勾選「仍要送出」才能通過
- 免登入，靠下拉選姓名辨識（信任制）
- 「我的紀錄」只能編輯/刪除「自己」且「當月（依派工的 Date 欄位所屬年月）」的紀錄；跨月資料鎖定，不可自行修改
- 刪除一律軟刪除（狀態欄位標記為 `已刪除`），不得真的移除資料列
- 所有金額欄位一律不四捨五入，維持原始浮點數（比照現有 Excel 慣例）

---

## File Structure

```
dispatch-payment-tracker/
├── package.json
├── .gitignore
├── docs/superpowers/{specs,plans}/...
├── shared/
│   ├── calc.js       純函式：稅前單價/工時/天數/加班費/mark up/小計/合計
│   ├── schema.js      純函式：Sheet 欄位定義（HEADERS）與物件↔陣列轉換
│   ├── settings.js     純函式：解析『設定』分頁資料、預設值
│   └── dispatch.js     純函式：派工編號、角色/單價判斷、開放派工清單、月份鎖定、整合送出邏輯
├── gas/
│   └── Code.js         GAS 專用：doGet/doPost 路由、Sheet 讀寫（glue code，不含商業邏輯）
├── tests/
│   ├── calc.test.js
│   ├── schema.test.js
│   ├── settings.test.js
│   └── dispatch.test.js
└── frontend/
    ├── index.html      首頁（兩個按鈕）
    ├── shared.js        callApi 共用函式
    ├── form.html        派工填寫頁
    └── my.html          我的紀錄頁
```

`shared/*.js` 採用雙模式寫法：在 Node 用 `require` 互相引用並匯出給測試使用；貼到 Apps Script 編輯器時，`require` 不存在，函式直接變成專案全域函式（跟 GBIC 現行的多檔案 GAS 專案模式相容）。部署時把 `shared/*.js` 與 `gas/Code.js` 的內容依序複製貼到 Apps Script 編輯器裡對應的 `.gs` 檔（檔名可保留 `Calc.gs`／`Schema.gs`／`Settings.gs`／`Dispatch.gs`／`Code.gs`），跟 GBIC 現行部署流程一致。

---

### Task 1: 專案骨架與測試環境

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `shared/.gitkeep`（可省略，靠後續任務建立實檔即可，不建立空檔）
- Create: `tests/.gitkeep`（同上，不建立空檔）

**Interfaces:**
- Consumes: 無
- Produces: `npm test` 指令可執行 `node --test tests/`

- [ ] **Step 1: 建立目錄與 package.json**

```bash
mkdir -p shared gas frontend tests
```

`package.json`:
```json
{
  "name": "dispatch-payment-tracker",
  "version": "0.1.0",
  "private": true,
  "description": "SDI / HDC 派工薪資明細系統",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: 建立 .gitignore**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: 建立 README.md**

```markdown
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
```

- [ ] **Step 4: 驗證測試指令可執行（尚無測試檔，預期顯示 0 個測試）**

Run: `npm test`
Expected: 指令成功結束（exit code 0），因為 `tests/` 目錄目前是空的，`node --test` 對空目錄視為沒有測試可跑，不會回報失敗。

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore README.md
git commit -m "chore: 專案骨架與測試環境"
```

---

### Task 2: `shared/calc.js` — 稅前單價／工時／天數／工時檢核

**Files:**
- Create: `shared/calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Produces: `taxExcluded(unitPrice)`, `hoursFromTimes(startTime, endTime)`, `days(hours)`, `isStandardHours(hours)` — 供 Task 3、Task 7 使用

- [ ] **Step 1: 寫失敗測試**

`tests/calc.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../shared/calc.js');

test('taxExcluded：單價 9200 對應現有 SDI 範例的稅前單價', () => {
  const result = calc.taxExcluded(9200);
  assert.ok(Math.abs(result - 8761.904761904761) < 1e-9);
});

test('taxExcluded：單價 7000／10200／8800（角色單價表）', () => {
  assert.ok(Math.abs(calc.taxExcluded(7000) - 6666.666666666666) < 1e-9);
  assert.ok(Math.abs(calc.taxExcluded(10200) - 9714.285714285714) < 1e-9);
  assert.ok(Math.abs(calc.taxExcluded(8800) - 8380.95238095238) < 1e-9);
});

test('hoursFromTimes：08:30~17:15 算出 8 小時（現有 SDI 範例）', () => {
  assert.equal(calc.hoursFromTimes('08:30', '17:15'), 8);
});

test('hoursFromTimes：08:40~17:11 算出 8 小時（現有 SDI 範例）', () => {
  assert.equal(calc.hoursFromTimes('08:40', '17:11'), 8);
});

test('hoursFromTimes：半天班 08:00~12:00 算出 4 小時', () => {
  assert.equal(calc.hoursFromTimes('08:00', '12:00'), 4);
});

test('days：工時 8 小時 = 1 天，工時 4 小時 = 0.5 天', () => {
  assert.equal(calc.days(8), 1);
  assert.equal(calc.days(4), 0.5);
});

test('isStandardHours：4 或 8 小時視為正常，其他要跳出確認', () => {
  assert.equal(calc.isStandardHours(4), true);
  assert.equal(calc.isStandardHours(8), true);
  assert.equal(calc.isStandardHours(6), false);
  assert.equal(calc.isStandardHours(9), false);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，因為 `shared/calc.js` 尚不存在（`Cannot find module '../shared/calc.js'`）

- [ ] **Step 3: 實作 `shared/calc.js`**

```js
function taxExcluded(unitPrice) {
  return unitPrice / 1.05;
}

function hoursFromTimes(startTime, endTime) {
  function toMinutes(t) {
    var parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  var diff = toMinutes(endTime) - toMinutes(startTime);
  if (diff < 0) diff += 24 * 60;
  return Math.floor(diff / 60);
}

function days(hours) {
  return hours / 8;
}

function isStandardHours(hours) {
  return hours === 4 || hours === 8;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { taxExcluded: taxExcluded, hoursFromTimes: hoursFromTimes, days: days, isStandardHours: isStandardHours };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS，全部 8 個測試通過

- [ ] **Step 5: Commit**

```bash
git add shared/calc.js tests/calc.test.js
git commit -m "feat: 稅前單價/工時/天數/工時檢核純函式"
```

---

### Task 3: `shared/calc.js` — 加班費／mark up／服務費小計／合計

**Files:**
- Modify: `shared/calc.js`
- Modify: `tests/calc.test.js`

**Interfaces:**
- Consumes: `taxExcluded` (Task 2)
- Produces: `overtimePay(unitPrice, overtimeHours)`, `markup(unitPrice, dayCount)`, `serviceSubtotal(unitPrice, dayCount, overtimeHours)`, `transportLodgingSubtotal(transportation, lodging)`, `amount(serviceSubtotalValue, transportLodgingSubtotalValue)` — 供 Task 7 使用

- [ ] **Step 1: 加測試**

在 `tests/calc.test.js` 最後加入：
```js
test('markup：單價 9200、天數 1 => 438.0952380952381（現有 SDI 範例）', () => {
  const result = calc.markup(9200, 1);
  assert.ok(Math.abs(result - 438.0952380952381) < 1e-9);
});

test('serviceSubtotal：單價 9200、天數 1、無加班 => 9200（現有 SDI 範例）', () => {
  const result = calc.serviceSubtotal(9200, 1, 0);
  assert.ok(Math.abs(result - 9200) < 1e-9);
});

test('overtimePay：單價 9200、加班 2 小時 => 2935.2380952380954', () => {
  const result = calc.overtimePay(9200, 2);
  assert.ok(Math.abs(result - 2935.2380952380954) < 1e-6);
});

test('serviceSubtotal：單價 9200、天數 1、加班 2 小時 => 12135.238095238095', () => {
  const result = calc.serviceSubtotal(9200, 1, 2);
  assert.ok(Math.abs(result - 12135.238095238095) < 1e-6);
});

test('transportLodgingSubtotal 與 amount：交通 3495、住宿 0 => 合計 12695（現有 SDI 範例）', () => {
  const tl = calc.transportLodgingSubtotal(3495, 0);
  assert.equal(tl, 3495);
  const total = calc.amount(9200, tl);
  assert.equal(total, 12695);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`calc.markup is not a function` 等錯誤

- [ ] **Step 3: 實作**

把 `shared/calc.js` 改成（在既有函式之後、`module.exports` 之前加入）：
```js
function overtimePay(unitPrice, overtimeHours) {
  return (taxExcluded(unitPrice) / 8) * overtimeHours * 1.34;
}

function markup(unitPrice, dayCount) {
  return taxExcluded(unitPrice) * 0.05 * dayCount;
}

function serviceSubtotal(unitPrice, dayCount, overtimeHours) {
  return taxExcluded(unitPrice) * dayCount + overtimePay(unitPrice, overtimeHours) + markup(unitPrice, dayCount);
}

function transportLodgingSubtotal(transportation, lodging) {
  return transportation + lodging;
}

function amount(serviceSubtotalValue, transportLodgingSubtotalValue) {
  return serviceSubtotalValue + transportLodgingSubtotalValue;
}
```

並把 `module.exports` 區塊改成：
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    taxExcluded: taxExcluded,
    hoursFromTimes: hoursFromTimes,
    days: days,
    isStandardHours: isStandardHours,
    overtimePay: overtimePay,
    markup: markup,
    serviceSubtotal: serviceSubtotal,
    transportLodgingSubtotal: transportLodgingSubtotal,
    amount: amount
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS，全部通過

- [ ] **Step 5: Commit**

```bash
git add shared/calc.js tests/calc.test.js
git commit -m "feat: 加班費/mark up/服務費小計/合計純函式"
```

---

### Task 4: `shared/schema.js` — Sheet 欄位定義與物件轉陣列

**Files:**
- Create: `shared/schema.js`
- Test: `tests/schema.test.js`

**Interfaces:**
- Produces: `HEADERS`（陣列常數）、`rowObjectToArray(headers, obj)` — 供 Task 7、Task 8、Task 11 使用

- [ ] **Step 1: 寫失敗測試**

`tests/schema.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../shared/schema.js');

test('HEADERS 包含全部 26 個欄位，且順序固定', () => {
  assert.deepEqual(schema.HEADERS, [
    'RecordID', '建立時間', '修改時間', '類型', 'No', 'DispatchNo', 'Project', 'Date',
    '姓名', '角色', '單價', '稅前單價', '出發時間', '上班時間', '下班時間', '工時', '天數',
    '加班時數', '加班費', 'mark up (5%)', '服務費小計', '交通費', '住宿費', '交通住宿小計',
    '合計', '狀態'
  ]);
});

test('rowObjectToArray：依 HEADERS 順序取值，缺的欄位補空字串', () => {
  const headers = ['a', 'b', 'c'];
  const obj = { a: 1, c: 'x' };
  assert.deepEqual(schema.rowObjectToArray(headers, obj), [1, '', 'x']);
});

test('rowObjectToArray：值為 0 要保留 0，不能被當成缺值補空字串', () => {
  const headers = ['a', 'b'];
  const obj = { a: 0, b: 0 };
  assert.deepEqual(schema.rowObjectToArray(headers, obj), [0, 0]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../shared/schema.js'`

- [ ] **Step 3: 實作 `shared/schema.js`**

```js
var HEADERS = [
  'RecordID', '建立時間', '修改時間', '類型', 'No', 'DispatchNo', 'Project', 'Date',
  '姓名', '角色', '單價', '稅前單價', '出發時間', '上班時間', '下班時間', '工時', '天數',
  '加班時數', '加班費', 'mark up (5%)', '服務費小計', '交通費', '住宿費', '交通住宿小計',
  '合計', '狀態'
];

function rowObjectToArray(headers, obj) {
  return headers.map(function (h) {
    var value = obj[h];
    return (value === undefined || value === null) ? '' : value;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HEADERS: HEADERS, rowObjectToArray: rowObjectToArray };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/schema.js tests/schema.test.js
git commit -m "feat: Sheet 欄位定義與物件轉陣列純函式"
```

---

### Task 5: `shared/settings.js` — 解析『設定』分頁

**Files:**
- Create: `shared/settings.js`
- Test: `tests/settings.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS`（常數）、`parseSettingsRows(rows)` — 供 Task 7、Task 8 使用

- [ ] **Step 1: 寫失敗測試**

`tests/settings.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../shared/settings.js');

test('DEFAULT_SETTINGS 內容符合 spec 單價表', () => {
  assert.deepEqual(settings.DEFAULT_SETTINGS, {
    SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
    HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
  });
});

test('parseSettingsRows：把 Sheet 二維陣列轉成設定物件', () => {
  const rows = [
    ['專案', 'Dispatch No. 前綴', 'Engineer 單價', 'Worker 單價'],
    ['SDI', 'PR26A014', 9200, 7000],
    ['HDC', 'PR26A014', 10200, 8800]
  ];
  assert.deepEqual(settings.parseSettingsRows(rows), {
    SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
    HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
  });
});

test('parseSettingsRows：忽略專案欄位空白的列', () => {
  const rows = [
    ['專案', 'Dispatch No. 前綴', 'Engineer 單價', 'Worker 單價'],
    ['SDI', 'PR26A014', 9200, 7000],
    ['', '', '', '']
  ];
  assert.deepEqual(Object.keys(settings.parseSettingsRows(rows)), ['SDI']);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../shared/settings.js'`

- [ ] **Step 3: 實作 `shared/settings.js`**

```js
var DEFAULT_SETTINGS = {
  SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
  HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
};

function parseSettingsRows(rows) {
  var result = {};
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var project = row[0];
    if (!project) continue;
    result[project] = {
      prefix: row[1],
      rates: { Engineer: Number(row[2]), Worker: Number(row[3]) }
    };
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_SETTINGS: DEFAULT_SETTINGS, parseSettingsRows: parseSettingsRows };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/settings.js tests/settings.test.js
git commit -m "feat: 設定分頁解析純函式與預設單價表"
```

---

### Task 6: `shared/dispatch.js` — 派工編號、角色/單價判斷、月份鎖定

**Files:**
- Create: `shared/dispatch.js`
- Test: `tests/dispatch.test.js`

**Interfaces:**
- Produces: `formatDateYYMMDD(dateISO)`, `nextDispatchNo(records, dateISO, prefix)`, `resolveRoleAndRate(project, isJoiningExisting, chosenRole, rateTable)`, `isSameMonth(dateISO, referenceISO)`, `canEditRecord(record, requesterName, todayISO)` — 供 Task 7 使用

- [ ] **Step 1: 寫失敗測試**

`tests/dispatch.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const dispatch = require('../shared/dispatch.js');

test('formatDateYYMMDD：2026-07-07 => 260707', () => {
  assert.equal(dispatch.formatDateYYMMDD('2026-07-07'), '260707');
});

test('formatDateYYMMDD：2026-08-31 => 260831', () => {
  assert.equal(dispatch.formatDateYYMMDD('2026-08-31'), '260831');
});

test('nextDispatchNo：當天沒有任何派工 => 配 A', () => {
  const result = dispatch.nextDispatchNo([], '2026-07-07', 'PR26A014');
  assert.equal(result, 'PR26A014-260707-A');
});

test('nextDispatchNo：當天已有 1 組不同派工 => 配 B（同一 DispatchNo 出現兩次只算一組）', () => {
  const records = [
    { type: '派工', date: '2026-07-07', status: '正常', DispatchNo: 'PR26A014-260707-A' },
    { type: '派工', date: '2026-07-07', status: '正常', DispatchNo: 'PR26A014-260707-A' }
  ];
  const result = dispatch.nextDispatchNo(records, '2026-07-07', 'PR26A014');
  assert.equal(result, 'PR26A014-260707-B');
});

test('nextDispatchNo：忽略已刪除與其他日期的紀錄', () => {
  const records = [
    { type: '派工', date: '2026-07-07', status: '已刪除', DispatchNo: 'PR26A014-260707-A' },
    { type: '派工', date: '2026-07-06', status: '正常', DispatchNo: 'PR26A014-260706-A' }
  ];
  const result = dispatch.nextDispatchNo(records, '2026-07-07', 'PR26A014');
  assert.equal(result, 'PR26A014-260707-A');
});

const rateTable = {
  SDI: { Engineer: 9200, Worker: 7000 },
  HDC: { Engineer: 10200, Worker: 8800 }
};

test('resolveRoleAndRate：SDI 新增派工固定 Engineer/9200', () => {
  assert.deepEqual(dispatch.resolveRoleAndRate('SDI', false, null, rateTable), { role: 'Engineer', rate: 9200 });
});

test('resolveRoleAndRate：SDI 加入既有派工固定 Worker/7000', () => {
  assert.deepEqual(dispatch.resolveRoleAndRate('SDI', true, null, rateTable), { role: 'Worker', rate: 7000 });
});

test('resolveRoleAndRate：HDC 自選 Engineer => 10200', () => {
  assert.deepEqual(dispatch.resolveRoleAndRate('HDC', false, 'Engineer', rateTable), { role: 'Engineer', rate: 10200 });
});

test('resolveRoleAndRate：HDC 自選 Worker => 8800（即使是加入既有派工也一樣要自選）', () => {
  assert.deepEqual(dispatch.resolveRoleAndRate('HDC', true, 'Worker', rateTable), { role: 'Worker', rate: 8800 });
});

test('resolveRoleAndRate：HDC 沒選角色要丟錯誤', () => {
  assert.throws(() => dispatch.resolveRoleAndRate('HDC', false, null, rateTable), /chosenRole/);
});

test('isSameMonth：同年月為 true，跨月為 false', () => {
  assert.equal(dispatch.isSameMonth('2026-07-07', '2026-07-20'), true);
  assert.equal(dispatch.isSameMonth('2026-07-07', '2026-08-01'), false);
});

test('canEditRecord：本人、正常狀態、當月 => 可編輯', () => {
  const record = { '姓名': '林哲宇', '狀態': '正常', 'Date': '2026-07-07' };
  assert.equal(dispatch.canEditRecord(record, '林哲宇', '2026-07-20'), true);
});

test('canEditRecord：非本人 => 不可編輯', () => {
  const record = { '姓名': '林哲宇', '狀態': '正常', 'Date': '2026-07-07' };
  assert.equal(dispatch.canEditRecord(record, '莊志傳', '2026-07-20'), false);
});

test('canEditRecord：跨月 => 不可編輯', () => {
  const record = { '姓名': '林哲宇', '狀態': '正常', 'Date': '2026-07-07' };
  assert.equal(dispatch.canEditRecord(record, '林哲宇', '2026-08-01'), false);
});

test('canEditRecord：已刪除 => 不可編輯', () => {
  const record = { '姓名': '林哲宇', '狀態': '已刪除', 'Date': '2026-07-07' };
  assert.equal(dispatch.canEditRecord(record, '林哲宇', '2026-07-20'), false);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../shared/dispatch.js'`

- [ ] **Step 3: 實作 `shared/dispatch.js`**

```js
function formatDateYYMMDD(dateISO) {
  var parts = dateISO.split('-');
  return parts[0].slice(2) + parts[1] + parts[2];
}

function nextDispatchNo(records, dateISO, prefix) {
  var distinct = {};
  records.forEach(function (r) {
    if (r.type === '派工' && r.date === dateISO && r.status === '正常') {
      distinct[r.DispatchNo] = true;
    }
  });
  var count = Object.keys(distinct).length;
  var letter = String.fromCharCode(65 + count);
  return prefix + '-' + formatDateYYMMDD(dateISO) + '-' + letter;
}

function resolveRoleAndRate(project, isJoiningExisting, chosenRole, rateTable) {
  var role;
  if (project === 'SDI') {
    role = isJoiningExisting ? 'Worker' : 'Engineer';
  } else if (project === 'HDC') {
    if (chosenRole !== 'Worker' && chosenRole !== 'Engineer') {
      throw new Error('HDC 派工需要選擇 chosenRole（Worker 或 Engineer）');
    }
    role = chosenRole;
  } else {
    throw new Error('未知的專案：' + project);
  }
  var projectRates = rateTable[project];
  if (!projectRates || typeof projectRates[role] !== 'number') {
    throw new Error('找不到 ' + project + '/' + role + ' 的單價設定');
  }
  return { role: role, rate: projectRates[role] };
}

function isSameMonth(dateISO, referenceISO) {
  return dateISO.slice(0, 7) === referenceISO.slice(0, 7);
}

function canEditRecord(record, requesterName, todayISO) {
  return record['姓名'] === requesterName &&
    record['狀態'] === '正常' &&
    isSameMonth(record['Date'], todayISO);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDateYYMMDD: formatDateYYMMDD,
    nextDispatchNo: nextDispatchNo,
    resolveRoleAndRate: resolveRoleAndRate,
    isSameMonth: isSameMonth,
    canEditRecord: canEditRecord
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/dispatch.js tests/dispatch.test.js
git commit -m "feat: 派工編號/角色單價判斷/月份鎖定純函式"
```

---

### Task 7: `shared/dispatch.js` — 開放派工清單、送出/編輯整合邏輯

**Files:**
- Modify: `shared/dispatch.js`
- Modify: `tests/dispatch.test.js`

**Interfaces:**
- Consumes: `taxExcluded, hoursFromTimes, days, isStandardHours, overtimePay, markup, serviceSubtotal, transportLodgingSubtotal, amount`（`shared/calc.js`，Task 2/3）；`nextDispatchNo, resolveRoleAndRate`（本檔案，Task 6）
- Produces: `findOpenDispatches(records, dateISO)`, `buildDispatchRecord(input, settings, existingRecords, nowISO)`, `recalcRecordFields(record, edits)` — 供 Task 10、11、12 使用

- [ ] **Step 1: 加測試**

在 `tests/dispatch.test.js` 最後加入：
```js
test('findOpenDispatches：回傳當天未滿 2 人的派工，且合併同一 DispatchNo', () => {
  const records = [
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: 'A案', 姓名: '莊志傳' },
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-B', Project: 'B案', 姓名: '林哲宇' },
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-B', Project: 'B案', 姓名: '古尚杰' }
  ];
  const result = dispatch.findOpenDispatches(records, '2026-08-03');
  assert.deepEqual(result, [
    { dispatchNo: 'PR26A014-260803-A', project: 'A案', date: '2026-08-03', memberCount: 1 }
  ]);
});

test('findOpenDispatches：忽略已刪除、其他日期、固定費用列', () => {
  const records = [
    { type: '派工', date: '2026-08-03', status: '已刪除', DispatchNo: 'PR26A014-260803-A', Project: 'A案' },
    { type: '派工', date: '2026-08-04', status: '正常', DispatchNo: 'PR26A014-260804-A', Project: 'C案' },
    { type: '固定費用', date: '2026-08-03', status: '正常', DispatchNo: 'X', Project: null }
  ];
  const result = dispatch.findOpenDispatches(records, '2026-08-03');
  assert.deepEqual(result, []);
});

const settings = {
  SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
  HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
};

test('buildDispatchRecord：SDI 新增派工，工時 8 小時，比對現有範例金額', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '260707-(NHOA) Bigbattery',
    chosenRole: null,
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 3495, lodging: 0, forceSubmit: false
  };
  const result = dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['DispatchNo'], 'PR26A014-260707-A');
  assert.equal(result.record['角色'], 'Engineer');
  assert.equal(result.record['單價'], 9200);
  assert.equal(result.record['工時'], 8);
  assert.equal(result.record['天數'], 1);
  assert.ok(Math.abs(result.record['服務費小計'] - 9200) < 1e-6);
  assert.ok(Math.abs(result.record['合計'] - 12695) < 1e-6);
  assert.equal(result.record['狀態'], '正常');
});

test('buildDispatchRecord：SDI 加入既有派工 => Worker/7000，沿用 DispatchNo/Project', () => {
  const existing = [
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: '260803_USES Taya Longjing 2', 姓名: '莊志傳' }
  ];
  const input = {
    project: 'SDI', name: '古尚杰', date: '2026-08-03',
    isJoiningExisting: true, joinDispatchNo: 'PR26A014-260803-A', newProjectText: null,
    chosenRole: null,
    departureTime: '17:20', startTime: '08:40', endTime: '17:20',
    overtimeHours: 0, transportation: 591, lodging: 0, forceSubmit: false
  };
  const result = dispatch.buildDispatchRecord(input, settings, existing, '2026-08-03T09:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['DispatchNo'], 'PR26A014-260803-A');
  assert.equal(result.record['Project'], '260803_USES Taya Longjing 2');
  assert.equal(result.record['角色'], 'Worker');
  assert.equal(result.record['單價'], 7000);
});

test('buildDispatchRecord：加入不存在或已滿的派工要丟錯誤', () => {
  const input = {
    project: 'SDI', name: '古尚杰', date: '2026-08-03',
    isJoiningExisting: true, joinDispatchNo: 'PR26A014-NOT-EXIST', newProjectText: null,
    chosenRole: null,
    departureTime: '17:20', startTime: '08:40', endTime: '17:20',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-08-03T09:00:00.000Z'), /not open|不open|找不到|無法加入/);
});

test('buildDispatchRecord：工時非 4/8 小時且未強制送出 => 回傳 needsConfirmation', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    departureTime: '15:00', startTime: '08:30', endTime: '15:00',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  const result = dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z');
  assert.equal(result.ok, false);
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.hours, 6);
});

test('buildDispatchRecord：工時非 4/8 小時但 forceSubmit=true => 照常建立紀錄', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    departureTime: '15:00', startTime: '08:30', endTime: '15:00',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: true
  };
  const result = dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['工時'], 6);
});

test('buildDispatchRecord：HDC 沒選角色要丟錯誤', () => {
  const input = {
    project: 'HDC', name: '莊志傳', date: '2026-08-03',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    departureTime: '17:00', startTime: '08:00', endTime: '16:00',
    overtimeHours: 0, transportation: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-08-03T09:00:00.000Z'), /chosenRole/);
});

test('recalcRecordFields：修改交通費與加班時數後重新試算', () => {
  const record = {
    'RecordID': 'r1', '姓名': '林哲宇', '單價': 9200, '狀態': '正常', 'Date': '2026-07-07',
    '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '工時': 8, '天數': 1, '加班時數': 0, '加班費': 0, 'mark up (5%)': 438.0952380952381,
    '服務費小計': 9200, '交通費': 3495, '住宿費': 0, '交通住宿小計': 3495, '合計': 12695
  };
  const result = dispatch.recalcRecordFields(record, { transportation: 1000, overtimeHours: 1, forceSubmit: false });
  assert.equal(result.ok, true);
  assert.equal(result.record['交通費'], 1000);
  assert.equal(result.record['加班時數'], 1);
  assert.ok(Math.abs(result.record['交通住宿小計'] - 1000) < 1e-6);
  assert.ok(result.record['合計'] !== 12695);
});

test('recalcRecordFields：改成非 4/8 小時的時間且未強制 => needsConfirmation', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  const result = dispatch.recalcRecordFields(record, { endTime: '15:00' });
  assert.equal(result.ok, false);
  assert.equal(result.needsConfirmation, true);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`dispatch.findOpenDispatches is not a function` 等錯誤

- [ ] **Step 3: 實作**

把 `shared/dispatch.js` 開頭加入依賴載入（放在檔案最上方），並在既有函式後加入新函式，最後更新 `module.exports`：

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

（在 Apps Script 環境 `require` 不存在，這段整個略過，`taxExcluded` 等函式會直接是 `Calc.gs` 定義的全域函式。）

在 `canEditRecord` 之後加入：
```js
function findOpenDispatches(records, dateISO) {
  var groups = {};
  records.forEach(function (r) {
    if (r.type !== '派工' || r.date !== dateISO || r.status !== '正常') return;
    if (!groups[r.DispatchNo]) {
      groups[r.DispatchNo] = { dispatchNo: r.DispatchNo, project: r.Project, date: r.date, memberCount: 0 };
    }
    groups[r.DispatchNo].memberCount += 1;
  });
  return Object.keys(groups)
    .map(function (key) { return groups[key]; })
    .filter(function (g) { return g.memberCount < 2; });
}

function buildDispatchRecord(input, settings, existingRecords, nowISO) {
  var hours = hoursFromTimes(input.startTime, input.endTime);
  if (!isStandardHours(hours) && !input.forceSubmit) {
    return { ok: false, needsConfirmation: true, hours: hours };
  }

  var dispatchNo, projectText;
  if (input.isJoiningExisting) {
    var openGroups = findOpenDispatches(existingRecords, input.date)
      .filter(function (g) { return g.dispatchNo === input.joinDispatchNo; });
    if (openGroups.length === 0) {
      throw new Error('找不到可加入的派工，或該派工已滿 2 人：' + input.joinDispatchNo);
    }
    dispatchNo = input.joinDispatchNo;
    projectText = openGroups[0].project;
  } else {
    dispatchNo = nextDispatchNo(existingRecords, input.date, settings[input.project].prefix);
    projectText = input.newProjectText;
  }

  var roleRate = resolveRoleAndRate(input.project, input.isJoiningExisting, input.chosenRole, {
    SDI: settings.SDI.rates,
    HDC: settings.HDC.rates
  });

  var dayCount = days(hours);
  var taxEx = taxExcluded(roleRate.rate);
  var ot = overtimePay(roleRate.rate, input.overtimeHours);
  var mk = markup(roleRate.rate, dayCount);
  var svcSubtotal = serviceSubtotal(roleRate.rate, dayCount, input.overtimeHours);
  var tlSubtotal = transportLodgingSubtotal(input.transportation, input.lodging);
  var total = amount(svcSubtotal, tlSubtotal);

  var record = {
    'RecordID': null,
    '建立時間': nowISO,
    '修改時間': nowISO,
    '類型': '派工',
    'No': null,
    'DispatchNo': dispatchNo,
    'Project': projectText,
    'Date': input.date,
    '姓名': input.name,
    '角色': roleRate.role,
    '單價': roleRate.rate,
    '稅前單價': taxEx,
    '出發時間': input.departureTime,
    '上班時間': input.startTime,
    '下班時間': input.endTime,
    '工時': hours,
    '天數': dayCount,
    '加班時數': input.overtimeHours,
    '加班費': ot,
    'mark up (5%)': mk,
    '服務費小計': svcSubtotal,
    '交通費': input.transportation,
    '住宿費': input.lodging,
    '交通住宿小計': tlSubtotal,
    '合計': total,
    '狀態': '正常'
  };

  return { ok: true, needsConfirmation: false, record: record };
}

function recalcRecordFields(record, edits) {
  var departureTime = edits.departureTime !== undefined ? edits.departureTime : record['出發時間'];
  var startTime = edits.startTime !== undefined ? edits.startTime : record['上班時間'];
  var endTime = edits.endTime !== undefined ? edits.endTime : record['下班時間'];
  var overtimeHours = edits.overtimeHours !== undefined ? edits.overtimeHours : record['加班時數'];
  var transportation = edits.transportation !== undefined ? edits.transportation : record['交通費'];
  var lodging = edits.lodging !== undefined ? edits.lodging : record['住宿費'];

  var hours = hoursFromTimes(startTime, endTime);
  if (!isStandardHours(hours) && !edits.forceSubmit) {
    return { ok: false, needsConfirmation: true, hours: hours };
  }

  var dayCount = days(hours);
  var rate = record['單價'];
  var taxEx = taxExcluded(rate);
  var ot = overtimePay(rate, overtimeHours);
  var mk = markup(rate, dayCount);
  var svcSubtotal = serviceSubtotal(rate, dayCount, overtimeHours);
  var tlSubtotal = transportLodgingSubtotal(transportation, lodging);
  var total = amount(svcSubtotal, tlSubtotal);

  var updated = Object.assign({}, record, {
    '出發時間': departureTime,
    '上班時間': startTime,
    '下班時間': endTime,
    '工時': hours,
    '天數': dayCount,
    '加班時數': overtimeHours,
    '加班費': ot,
    'mark up (5%)': mk,
    '服務費小計': svcSubtotal,
    '交通費': transportation,
    '住宿費': lodging,
    '交通住宿小計': tlSubtotal,
    '合計': total
  });

  return { ok: true, needsConfirmation: false, record: updated };
}
```

`module.exports` 改成：
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDateYYMMDD: formatDateYYMMDD,
    nextDispatchNo: nextDispatchNo,
    resolveRoleAndRate: resolveRoleAndRate,
    isSameMonth: isSameMonth,
    canEditRecord: canEditRecord,
    findOpenDispatches: findOpenDispatches,
    buildDispatchRecord: buildDispatchRecord,
    recalcRecordFields: recalcRecordFields
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS，全部測試通過（`calc.test.js`、`schema.test.js`、`settings.test.js`、`dispatch.test.js`）

- [ ] **Step 5: Commit**

```bash
git add shared/dispatch.js tests/dispatch.test.js
git commit -m "feat: 開放派工清單與派工送出/編輯整合邏輯"
```

---

### Task 8: `gas/Code.js` — Google Sheet 建置腳本（手動驗證）

**Files:**
- Create: `gas/Code.js`

**Interfaces:**
- Consumes: `HEADERS`（`shared/schema.js`）、`DEFAULT_SETTINGS`（`shared/settings.js`）— 部署後在 Apps Script 專案內為全域函式
- Produces: `getSpreadsheet_()`, `setupSheets()` — 供後續任務使用

此任務起無法用 Node 測試（依賴 `SpreadsheetApp`），改用「部署到 Apps Script 編輯器後手動執行驗證」。

- [ ] **Step 1: 建立 Google 試算表與 Apps Script 專案**

1. 到 Google Drive 建立一份新的 Google Sheet，命名為「派工薪資明細系統」，記下網址列的試算表 ID（`https://docs.google.com/spreadsheets/d/{這一段}/edit`）
2. 到 `script.google.com` → New project，命名為「dispatch-payment-tracker」

- [ ] **Step 2: 撰寫 `gas/Code.js` 的 Sheet 建置部分**

```js
var SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet_(ss, name, headerRow) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headerRow);
  }
  return sheet;
}

function setupSheets() {
  var ss = getSpreadsheet_();
  ['SDI', 'HDC'].forEach(function (project) {
    getOrCreateSheet_(ss, project + '_紀錄', HEADERS);
    getOrCreateSheet_(ss, project + '_工程師', ['姓名', '啟用中']);
  });
  var settingsSheet = getOrCreateSheet_(ss, '設定', ['專案', 'Dispatch No. 前綴', 'Engineer 單價', 'Worker 單價']);
  if (settingsSheet.getLastRow() < 3) {
    settingsSheet.getRange(2, 1, 2, 4).setValues([
      ['SDI', DEFAULT_SETTINGS.SDI.prefix, DEFAULT_SETTINGS.SDI.rates.Engineer, DEFAULT_SETTINGS.SDI.rates.Worker],
      ['HDC', DEFAULT_SETTINGS.HDC.prefix, DEFAULT_SETTINGS.HDC.rates.Engineer, DEFAULT_SETTINGS.HDC.rates.Worker]
    ]);
  }
  Logger.log('setupSheets 完成');
}
```

- [ ] **Step 3: 手動部署與驗證**

1. 在 Apps Script 編輯器建立 4 個檔案（`Calc.gs`、`Schema.gs`、`Settings.gs`、`Dispatch.gs`），分別貼入 `shared/calc.js`、`shared/schema.js`、`shared/settings.js`、`shared/dispatch.js` 的內容
2. 建立 `Code.gs`，貼入上面的 `gas/Code.js` 內容，把 `SPREADSHEET_ID` 換成 Step 1 記下的 ID
3. 在編輯器選取 `setupSheets` 函式並執行（Run）
4. 檢查執行紀錄（Execution log）出現 `setupSheets 完成`，且沒有錯誤
5. 打開該 Google Sheet，確認出現 `SDI_紀錄`、`SDI_工程師`、`HDC_紀錄`、`HDC_工程師`、`設定` 五個分頁，`設定` 分頁內容為 SDI/HDC 兩列預設單價

Expected: 五個分頁都建立成功，`設定` 分頁資料正確，無錯誤訊息

- [ ] **Step 4: Commit**

```bash
git add gas/Code.js
git commit -m "feat: Google Sheet 建置腳本 setupSheets"
```

---

### Task 9: `gas/Code.js` — doGet/doPost 路由骨架

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Produces: `doGet(e)`, `doPost(e)`, `jsonResponse_(obj)` — 之後每個 action 任務都會往 `doPost` 的 `handlers` 物件加一行

- [ ] **Step 1: 加入路由程式碼**

在 `gas/Code.js` 最後加入：
```js
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonResponse_({ ok: true, message: 'Dispatch Payment Tracker API is running' });
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Invalid JSON payload' });
  }
  var handlers = {};
  var handler = handlers[payload.action];
  if (!handler) {
    return jsonResponse_({ ok: false, error: 'Unknown action: ' + payload.action });
  }
  try {
    return jsonResponse_(handler(payload));
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}
```

- [ ] **Step 2: 部署為 Web App 並手動驗證**

1. Apps Script 編輯器右上 Deploy → New deployment → 類型選 Web app，Execute as: Me，Who has access: Anyone
2. 部署後複製產生的網址（`.../exec` 結尾）
3. 用瀏覽器打開該網址，應看到 `{"ok":true,"message":"Dispatch Payment Tracker API is running"}`
4. 執行：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"notExist"}' \
     "貼上部署網址"
   ```
   Expected: 回傳 `{"ok":false,"error":"Unknown action: notExist"}`

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: doGet/doPost 路由骨架"
```

---

### Task 10: `getEngineers` / `getOpenDispatches` actions

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `findOpenDispatches`（`shared/dispatch.js`，Task 7）
- Produces: `handleGetEngineers(payload)`, `handleGetOpenDispatches(payload)`，並在 `doPost` 的 `handlers` 物件加入這兩個 action

- [ ] **Step 1: 實作 handler**

在 `gas/Code.js` 的 `jsonResponse_` 之前加入：
```js
function readSheetAsObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = values.slice(1);
  return rows.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function handleGetEngineers(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rows = readSheetAsObjects_(sheet);
  var engineers = rows
    .filter(function (r) { return r['啟用中'] === true || r['啟用中'] === 'TRUE'; })
    .map(function (r) { return r['姓名']; });
  return { ok: true, engineers: engineers };
}

function handleGetOpenDispatches(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    return { type: r['類型'], date: formatDateForCompare_(r['Date']), status: r['狀態'], DispatchNo: r['DispatchNo'], Project: r['Project'] };
  });
  var openDispatches = findOpenDispatches(records, payload.date);
  return { ok: true, openDispatches: openDispatches };
}

function formatDateForCompare_(dateValue) {
  if (Object.prototype.toString.call(dateValue) === '[object Date]') {
    return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return dateValue;
}
```

把 `doPost` 裡的 `var handlers = {};` 改成：
```js
  var handlers = {
    getEngineers: handleGetEngineers,
    getOpenDispatches: handleGetOpenDispatches
  };
```

- [ ] **Step 2: 手動驗證**

1. 打開試算表，到 `SDI_工程師` 分頁，加入兩列：`林哲宇 / TRUE`、`莊志傳 / TRUE`
2. 重新部署（Deploy → Manage deployments → 編輯 → 版本選 New version）
3. 執行：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"getEngineers","project":"SDI"}' \
     "部署網址"
   ```
   Expected: `{"ok":true,"engineers":["林哲宇","莊志傳"]}`
4. 執行：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"getOpenDispatches","project":"SDI","date":"2026-07-07"}' \
     "部署網址"
   ```
   Expected: `{"ok":true,"openDispatches":[]}`（因為 `SDI_紀錄` 分頁目前還沒有任何資料）

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: getEngineers/getOpenDispatches actions"
```

---

### Task 11: `previewRecord` / `submitRecord` actions

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `buildDispatchRecord`（`shared/dispatch.js`，Task 7）、`rowObjectToArray, HEADERS`（`shared/schema.js`，Task 4）、`parseSettingsRows`（`shared/settings.js`，Task 5）
- Produces: `handlePreviewRecord(payload)`, `handleSubmitRecord(payload)`，並在 `doPost` 的 `handlers` 物件加入這兩個 action

- [ ] **Step 1: 實作 handler**

在 `gas/Code.js` 加入：
```js
function getSettings_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('設定');
  var rows = sheet.getDataRange().getValues();
  return parseSettingsRows(rows);
}

function getRecordsForDispatchLogic_(project, dateISO) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(project + '_紀錄');
  return readSheetAsObjects_(sheet)
    .filter(function (r) { return formatDateForCompare_(r['Date']) === dateISO; })
    .map(function (r) {
      return {
        type: r['類型'], date: formatDateForCompare_(r['Date']), status: r['狀態'],
        DispatchNo: r['DispatchNo'], Project: r['Project']
      };
    });
}

function handlePreviewRecord(payload) {
  var settings = getSettings_();
  var existing = getRecordsForDispatchLogic_(payload.input.project, payload.input.date);
  return buildDispatchRecord(payload.input, settings, existing, new Date().toISOString());
}

function handleSubmitRecord(payload) {
  var settings = getSettings_();
  var existing = getRecordsForDispatchLogic_(payload.input.project, payload.input.date);
  var result = buildDispatchRecord(payload.input, settings, existing, new Date().toISOString());
  if (!result.ok) {
    return result;
  }
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.input.project + '_紀錄');
  result.record['RecordID'] = Utilities.getUuid();
  result.record['No'] = sheet.getLastRow();
  var rowArray = rowObjectToArray(HEADERS, result.record);
  sheet.appendRow(rowArray);
  return { ok: true };
}
```

把 `doPost` 裡的 `handlers` 物件改成：
```js
  var handlers = {
    getEngineers: handleGetEngineers,
    getOpenDispatches: handleGetOpenDispatches,
    previewRecord: handlePreviewRecord,
    submitRecord: handleSubmitRecord
  };
```

- [ ] **Step 2: 手動驗證**

1. 重新部署（New version）
2. 執行：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"previewRecord","input":{"project":"SDI","name":"林哲宇","date":"2026-07-07","isJoiningExisting":false,"joinDispatchNo":null,"newProjectText":"測試案","chosenRole":null,"departureTime":"17:24","startTime":"08:30","endTime":"17:15","overtimeHours":0,"transportation":3495,"lodging":0,"forceSubmit":false}}' \
     "部署網址"
   ```
   Expected: `ok:true`，`record` 內 `DispatchNo` 為 `PR26A014-260707-A`、`合計` 為 `12695`
3. 用同樣的 payload 把 `action` 換成 `submitRecord` 執行一次，Expected：回傳 `{"ok":true}`，且 `SDI_紀錄` 分頁多一列資料，欄位與計算結果正確
4. 重複執行同一個 `submitRecord`（同一天、`isJoiningExisting:false`），Expected：新產生的 `DispatchNo` 為 `PR26A014-260707-B`（因為當天已有一組派工）

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: previewRecord/submitRecord actions"
```

---

### Task 12: `getMyRecords` / `updateMyRecord` / `deleteMyRecord` actions

**Files:**
- Modify: `gas/Code.js`

**Interfaces:**
- Consumes: `canEditRecord, recalcRecordFields`（`shared/dispatch.js`，Task 6/7）、`rowObjectToArray, HEADERS`（`shared/schema.js`，Task 4）
- Produces: `handleGetMyRecords(payload)`, `handleUpdateMyRecord(payload)`, `handleDeleteMyRecord(payload)`，並在 `doPost` 的 `handlers` 物件加入這三個 action

- [ ] **Step 1: 實作 handler**

在 `gas/Code.js` 加入：
```js
function findRowIndexByRecordId_(sheet, recordId) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === recordId) {
      return i + 1; // Sheet 的列號從 1 開始，第 1 列是表頭
    }
  }
  return -1;
}

function rowToRecordObject_(sheet, rowIndex) {
  var headers = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var rowValues = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = rowValues[i]; });
  obj['Date'] = formatDateForCompare_(obj['Date']);
  return obj;
}

function handleGetMyRecords(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    r['Date'] = formatDateForCompare_(r['Date']);
    return r;
  });
  var filtered = records.filter(function (r) {
    return r['類型'] === '派工' &&
      r['姓名'] === payload.name &&
      r['狀態'] === '正常' &&
      r['Date'].slice(0, 7) === payload.yearMonth;
  });
  return { ok: true, records: filtered };
}

function handleUpdateMyRecord(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到紀錄：' + payload.recordId };
  }
  var record = rowToRecordObject_(sheet, rowIndex);
  var todayISO = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (!canEditRecord(record, payload.name, todayISO)) {
    return { ok: false, error: '沒有權限編輯此紀錄' };
  }
  var result = recalcRecordFields(record, payload.edits || {});
  if (!result.ok) {
    return result;
  }
  result.record['修改時間'] = new Date().toISOString();
  var rowArray = rowObjectToArray(HEADERS, result.record);
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowArray]);
  return { ok: true };
}

function handleDeleteMyRecord(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到紀錄：' + payload.recordId };
  }
  var record = rowToRecordObject_(sheet, rowIndex);
  var todayISO = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (!canEditRecord(record, payload.name, todayISO)) {
    return { ok: false, error: '沒有權限刪除此紀錄' };
  }
  var statusColumnIndex = HEADERS.indexOf('狀態') + 1;
  var modifiedColumnIndex = HEADERS.indexOf('修改時間') + 1;
  sheet.getRange(rowIndex, statusColumnIndex).setValue('已刪除');
  sheet.getRange(rowIndex, modifiedColumnIndex).setValue(new Date().toISOString());
  return { ok: true };
}
```

把 `doPost` 裡的 `handlers` 物件改成：
```js
  var handlers = {
    getEngineers: handleGetEngineers,
    getOpenDispatches: handleGetOpenDispatches,
    previewRecord: handlePreviewRecord,
    submitRecord: handleSubmitRecord,
    getMyRecords: handleGetMyRecords,
    updateMyRecord: handleUpdateMyRecord,
    deleteMyRecord: handleDeleteMyRecord
  };
```

- [ ] **Step 2: 手動驗證**

1. 重新部署（New version）
2. 用 Task 11 已建立的紀錄，執行：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"getMyRecords","project":"SDI","name":"林哲宇","yearMonth":"2026-07"}' \
     "部署網址"
   ```
   Expected: `ok:true`，`records` 內含剛剛送出的那筆，且有 `RecordID`
3. 把回傳的 `RecordID` 帶入：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"updateMyRecord","project":"SDI","name":"林哲宇","recordId":"貼上RecordID","edits":{"transportation":1000}}' \
     "部署網址"
   ```
   Expected: `{"ok":true}`，且該列的交通費、交通住宿小計、合計都更新
4. 執行：
   ```bash
   curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
     -d '{"action":"deleteMyRecord","project":"SDI","name":"林哲宇","recordId":"貼上RecordID"}' \
     "部署網址"
   ```
   Expected: `{"ok":true}`，該列狀態變成 `已刪除`（列本身還在，未被真的刪除）
5. 再次執行 `getMyRecords`，Expected：剛剛刪除的那筆不再出現在結果中

- [ ] **Step 3: Commit**

```bash
git add gas/Code.js
git commit -m "feat: getMyRecords/updateMyRecord/deleteMyRecord actions"
```

---

### Task 13: 前端首頁 `frontend/index.html`

**Files:**
- Create: `frontend/index.html`

**Interfaces:**
- Produces: 連到 `form.html?project=SDI` 與 `form.html?project=HDC` 的連結

- [ ] **Step 1: 建立首頁**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>派工薪資明細系統</title>
<style>
  body {
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
    background: #f5f5f7;
    margin: 0;
    padding: 40px 16px;
  }
  h1 { text-align: center; color: #1d1d1f; }
  .buttons {
    max-width: 480px;
    margin: 40px auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .btn-project {
    display: block;
    text-decoration: none;
    text-align: center;
    padding: 28px;
    border-radius: 14px;
    font-size: 20px;
    font-weight: 600;
    color: #fff;
  }
  .btn-sdi { background: #0071e3; }
  .btn-hdc { background: #347a3b; }
</style>
</head>
<body>
  <h1>派工薪資明細系統</h1>
  <div class="buttons">
    <a class="btn-project btn-sdi" href="form.html?project=SDI">SAMSUNG SDI 維運表單</a>
    <a class="btn-project btn-hdc" href="form.html?project=HDC">HANGANG NCS &amp; HDC 維運表單</a>
  </div>
</body>
</html>
```

- [ ] **Step 2: 手動驗證**

在本機用瀏覽器打開 `frontend/index.html`，確認兩個按鈕都能點擊並帶正確 `project` 參數導到 `form.html`（此時 `form.html` 尚未建立，屬正常現象，先確認網址列參數正確即可）

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: 首頁 SDI/HDC 入口按鈕"
```

---

### Task 14: `frontend/shared.js` 與派工填寫頁 `frontend/form.html`

**Files:**
- Create: `frontend/shared.js`
- Create: `frontend/form.html`

**Interfaces:**
- Consumes: `previewRecord`, `submitRecord`, `getEngineers`, `getOpenDispatches` actions（Task 10、11）

- [ ] **Step 1: 建立 `frontend/shared.js`**

```js
const SCRIPT_URL = 'PUT_YOUR_DEPLOYED_WEB_APP_URL_HERE';

function callApi(action, payload) {
  return fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  }).then(function (res) { return res.json(); });
}

function getProjectFromUrl() {
  return new URLSearchParams(window.location.search).get('project');
}
```

- [ ] **Step 2: 建立 `frontend/form.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>派工紀錄填寫</title>
<style>
  body { font-family: -apple-system, "PingFang TC", sans-serif; background: #f5f5f7; margin: 0; padding: 24px 16px; }
  .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 24px; }
  h1 { font-size: 20px; }
  label { display: block; margin-top: 16px; font-weight: 600; }
  select, input[type="date"], input[type="time"], input[type="number"], input[type="text"] {
    width: 100%; box-sizing: border-box; padding: 8px; margin-top: 6px; border-radius: 8px; border: 1px solid #ccc;
  }
  #dispatchChoices label { font-weight: normal; margin-top: 6px; }
  #previewBox { margin-top: 20px; padding: 14px; background: #f0f6ff; border-radius: 8px; line-height: 1.8; }
  #confirmHoursBox { margin-top: 12px; padding: 12px; background: #fff3cd; border-radius: 8px; display: none; }
  #successMessage { margin-top: 16px; padding: 12px; background: #d4f7dc; border-radius: 8px; display: none; }
  button { margin-top: 20px; width: 100%; padding: 14px; border: none; border-radius: 10px; background: #0071e3; color: #fff; font-size: 16px; font-weight: 600; }
</style>
</head>
<body>
  <div class="card">
    <h1 id="projectTitle"></h1>
    <form id="dispatchForm">
      <label>姓名</label>
      <select id="engineerSelect" required></select>

      <label>日期</label>
      <input type="date" id="dateInput" required>

      <label>派工選擇</label>
      <div id="dispatchChoices"></div>

      <div id="newProjectRow">
        <label>Project 說明（新增派工時填寫）</label>
        <input type="text" id="newProjectText">
      </div>

      <div id="roleRow" style="display:none;">
        <label>角色</label>
        <select id="roleSelect">
          <option value="Worker">Worker</option>
          <option value="Engineer">Engineer</option>
        </select>
      </div>

      <label>出發時間</label>
      <input type="time" id="departureTime">

      <label>上班時間</label>
      <input type="time" id="startTime" required>

      <label>下班時間</label>
      <input type="time" id="endTime" required>

      <label>加班時數</label>
      <input type="number" id="overtimeHours" value="0" min="0" step="0.5">

      <label>交通費</label>
      <input type="number" id="transportation" value="0" min="0">

      <label>住宿費</label>
      <input type="number" id="lodging" value="0" min="0">

      <div id="confirmHoursBox">
        <div id="confirmHoursText"></div>
        <label><input type="checkbox" id="forceSubmitCheckbox"> 仍要送出</label>
      </div>

      <div id="previewBox"></div>
      <div id="successMessage">已送出！</div>

      <button type="submit">送出</button>
    </form>
  </div>

  <script src="shared.js"></script>
  <script>
    const project = getProjectFromUrl();
    let openDispatches = [];
    let lastPreviewNeedsConfirmation = false;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
      document.getElementById('projectTitle').textContent =
        project === 'HDC' ? 'HANGANG NCS & HDC 維運表單' : 'SAMSUNG SDI 維運表單';
      document.getElementById('roleRow').style.display = project === 'HDC' ? 'block' : 'none';

      callApi('getEngineers', { project: project }).then(function (res) {
        const select = document.getElementById('engineerSelect');
        (res.engineers || []).forEach(function (name) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        });
      });

      document.getElementById('dateInput').addEventListener('change', loadOpenDispatches);
      document.getElementById('dispatchForm').addEventListener('input', schedulePreview);
      document.getElementById('dispatchForm').addEventListener('submit', onSubmit);
    }

    function loadOpenDispatches() {
      const date = document.getElementById('dateInput').value;
      if (!date) return;
      callApi('getOpenDispatches', { project: project, date: date }).then(function (res) {
        openDispatches = res.openDispatches || [];
        renderDispatchChoices();
      });
    }

    function renderDispatchChoices() {
      const container = document.getElementById('dispatchChoices');
      container.innerHTML = '';
      const newLabel = document.createElement('label');
      newLabel.innerHTML = '<input type="radio" name="dispatchChoice" value="new" checked> 新增派工';
      container.appendChild(newLabel);
      openDispatches.forEach(function (g) {
        const label = document.createElement('label');
        label.innerHTML = '<input type="radio" name="dispatchChoice" value="' + g.dispatchNo + '"> 加入既有派工：' +
          g.dispatchNo + '（' + g.project + '）';
        container.appendChild(label);
      });
      toggleNewProjectField();
      container.querySelectorAll('input[name="dispatchChoice"]').forEach(function (input) {
        input.addEventListener('change', function () { toggleNewProjectField(); schedulePreview(); });
      });
    }

    function toggleNewProjectField() {
      const choice = document.querySelector('input[name="dispatchChoice"]:checked');
      const isNew = !choice || choice.value === 'new';
      document.getElementById('newProjectRow').style.display = isNew ? 'block' : 'none';
    }

    function buildInputPayload(forceSubmit) {
      const choice = document.querySelector('input[name="dispatchChoice"]:checked');
      const isJoining = !!choice && choice.value !== 'new';
      return {
        project: project,
        name: document.getElementById('engineerSelect').value,
        date: document.getElementById('dateInput').value,
        isJoiningExisting: isJoining,
        joinDispatchNo: isJoining ? choice.value : null,
        newProjectText: isJoining ? null : document.getElementById('newProjectText').value,
        chosenRole: project === 'HDC' ? document.getElementById('roleSelect').value : null,
        departureTime: document.getElementById('departureTime').value,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        overtimeHours: Number(document.getElementById('overtimeHours').value || 0),
        transportation: Number(document.getElementById('transportation').value || 0),
        lodging: Number(document.getElementById('lodging').value || 0),
        forceSubmit: !!forceSubmit
      };
    }

    let previewTimer = null;
    function schedulePreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(runPreview, 400);
    }

    function runPreview() {
      const input = buildInputPayload(false);
      if (!input.name || !input.date || !input.startTime || !input.endTime) return;
      callApi('previewRecord', { input: input }).then(renderPreview);
    }

    function renderPreview(res) {
      const box = document.getElementById('previewBox');
      const confirmBox = document.getElementById('confirmHoursBox');
      if (!res.ok && res.needsConfirmation) {
        lastPreviewNeedsConfirmation = true;
        confirmBox.style.display = 'block';
        document.getElementById('confirmHoursText').textContent =
          '工時計算為 ' + res.hours + ' 小時，通常應為 4 或 8 小時，請確認上下班時間，或勾選下方仍要送出。';
        box.innerHTML = '';
        return;
      }
      lastPreviewNeedsConfirmation = false;
      confirmBox.style.display = 'none';
      if (!res.record) { box.innerHTML = ''; return; }
      const r = res.record;
      box.innerHTML =
        '角色：' + r['角色'] + '（單價 ' + r['單價'] + '）<br>' +
        '稅前單價：' + r['稅前單價'].toFixed(2) + '<br>' +
        '工時：' + r['工時'] + ' 小時，天數：' + r['天數'] + '<br>' +
        '加班費：' + r['加班費'].toFixed(2) + '<br>' +
        'mark up (5%)：' + r['mark up (5%)'].toFixed(2) + '<br>' +
        '服務費小計：' + r['服務費小計'].toFixed(2) + '<br>' +
        '交通住宿小計：' + r['交通住宿小計'].toFixed(2) + '<br>' +
        '<strong>合計：' + r['合計'].toFixed(2) + '</strong>';
    }

    function onSubmit(evt) {
      evt.preventDefault();
      const forceSubmit = lastPreviewNeedsConfirmation && document.getElementById('forceSubmitCheckbox').checked;
      if (lastPreviewNeedsConfirmation && !forceSubmit) {
        alert('工時不是 4 或 8 小時，請確認時間，或勾選「仍要送出」。');
        return;
      }
      const input = buildInputPayload(forceSubmit);
      callApi('submitRecord', { input: input }).then(function (res) {
        if (res.ok) {
          document.getElementById('dispatchForm').reset();
          document.getElementById('previewBox').innerHTML = '';
          document.getElementById('confirmHoursBox').style.display = 'none';
          document.getElementById('successMessage').style.display = 'block';
          lastPreviewNeedsConfirmation = false;
          loadOpenDispatches();
        } else if (res.needsConfirmation) {
          renderPreview(res);
        } else {
          alert('送出失敗：' + res.error);
        }
      });
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: 手動驗證**

1. 把 `frontend/shared.js` 的 `SCRIPT_URL` 換成 Task 9 部署的網址
2. 本機開啟 `frontend/form.html?project=SDI`：
   - 姓名下拉有正確清單
   - 選日期後，若當天已有未滿 2 人的派工，「派工選擇」要列出來
   - 填完時間欄位後 400ms 內出現試算結果
   - 故意填出 6 小時的班，應跳出確認區塊；勾選「仍要送出」才能成功送出
   - 送出成功後顯示成功訊息，且表單清空
3. 開啟 `frontend/form.html?project=HDC`，確認多出「角色」下拉且為必填

- [ ] **Step 4: Commit**

```bash
git add frontend/shared.js frontend/form.html
git commit -m "feat: 派工紀錄填寫頁"
```

---

### Task 15: 我的紀錄頁 `frontend/my.html`

**Files:**
- Create: `frontend/my.html`

**Interfaces:**
- Consumes: `getEngineers`, `getMyRecords`, `updateMyRecord`, `deleteMyRecord` actions（Task 10、12）

- [ ] **Step 1: 建立 `frontend/my.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>我的派工紀錄</title>
<style>
  body { font-family: -apple-system, "PingFang TC", sans-serif; background: #f5f5f7; margin: 0; padding: 24px 16px; }
  .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 24px; }
  label { display: inline-block; margin-right: 12px; font-weight: 600; }
  select, input[type="month"] { padding: 6px; border-radius: 8px; border: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; font-size: 14px; }
  .row-actions button { margin-right: 6px; }
  .edit-form input { width: 90px; padding: 4px; margin-right: 6px; }
</style>
</head>
<body>
  <div class="card">
    <h1>我的派工紀錄</h1>
    <label>姓名</label>
    <select id="engineerSelect"></select>
    <label>月份</label>
    <input type="month" id="monthInput">
    <button id="searchBtn">查詢</button>

    <table id="recordsTable">
      <thead>
        <tr>
          <th>日期</th><th>DispatchNo</th><th>Project</th><th>角色</th>
          <th>上班</th><th>下班</th><th>加班</th><th>交通</th><th>住宿</th><th>合計</th><th></th>
        </tr>
      </thead>
      <tbody id="recordsBody"></tbody>
    </table>
  </div>

  <script src="shared.js"></script>
  <script>
    const project = getProjectFromUrl();
    let currentRecords = [];

    document.addEventListener('DOMContentLoaded', init);

    function init() {
      callApi('getEngineers', { project: project }).then(function (res) {
        const select = document.getElementById('engineerSelect');
        (res.engineers || []).forEach(function (name) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        });
      });
      const now = new Date();
      document.getElementById('monthInput').value =
        now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      document.getElementById('searchBtn').addEventListener('click', search);
    }

    function search() {
      const name = document.getElementById('engineerSelect').value;
      const yearMonth = document.getElementById('monthInput').value;
      callApi('getMyRecords', { project: project, name: name, yearMonth: yearMonth }).then(function (res) {
        currentRecords = res.records || [];
        renderTable();
      });
    }

    function renderTable() {
      const body = document.getElementById('recordsBody');
      body.innerHTML = '';
      currentRecords.forEach(function (r) {
        const tr = document.createElement('tr');
        tr.dataset.recordId = r['RecordID'];
        tr.innerHTML =
          '<td>' + r['Date'] + '</td>' +
          '<td>' + r['DispatchNo'] + '</td>' +
          '<td>' + r['Project'] + '</td>' +
          '<td>' + r['角色'] + '</td>' +
          '<td>' + r['上班時間'] + '</td>' +
          '<td>' + r['下班時間'] + '</td>' +
          '<td>' + r['加班時數'] + '</td>' +
          '<td>' + r['交通費'] + '</td>' +
          '<td>' + r['住宿費'] + '</td>' +
          '<td>' + Number(r['合計']).toFixed(2) + '</td>' +
          '<td class="row-actions"><button class="editBtn">編輯</button><button class="deleteBtn">刪除</button></td>';
        tr.querySelector('.editBtn').addEventListener('click', function () { showEditForm(tr, r); });
        tr.querySelector('.deleteBtn').addEventListener('click', function () { deleteRecord(r); });
        body.appendChild(tr);
      });
    }

    function showEditForm(tr, record) {
      const editRow = document.createElement('tr');
      editRow.innerHTML =
        '<td colspan="11" class="edit-form">' +
        '交通費 <input type="number" class="editTransport" value="' + record['交通費'] + '">' +
        '住宿費 <input type="number" class="editLodging" value="' + record['住宿費'] + '">' +
        '加班時數 <input type="number" class="editOvertime" value="' + record['加班時數'] + '">' +
        '<button class="saveBtn">儲存</button>' +
        '</td>';
      tr.parentNode.insertBefore(editRow, tr.nextSibling);
      editRow.querySelector('.saveBtn').addEventListener('click', function () {
        const edits = {
          transportation: Number(editRow.querySelector('.editTransport').value),
          lodging: Number(editRow.querySelector('.editLodging').value),
          overtimeHours: Number(editRow.querySelector('.editOvertime').value)
        };
        saveEdit(record, edits, editRow);
      });
    }

    function saveEdit(record, edits, editRow) {
      const name = document.getElementById('engineerSelect').value;
      callApi('updateMyRecord', { project: project, name: name, recordId: record['RecordID'], edits: edits }).then(function (res) {
        if (res.ok) {
          editRow.remove();
          search();
        } else if (res.needsConfirmation) {
          alert('工時計算為 ' + res.hours + ' 小時，通常應為 4 或 8 小時，請確認時間後再試一次。');
        } else {
          alert('儲存失敗：' + res.error);
        }
      });
    }

    function deleteRecord(record) {
      if (!confirm('確定要刪除這筆紀錄嗎？')) return;
      const name = document.getElementById('engineerSelect').value;
      callApi('deleteMyRecord', { project: project, name: name, recordId: record['RecordID'] }).then(function (res) {
        if (res.ok) {
          search();
        } else {
          alert('刪除失敗：' + res.error);
        }
      });
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: 手動驗證**

1. 開啟 `frontend/my.html?project=SDI`，選 Task 11/12 用過的姓名與月份，按查詢
2. 確認表格顯示先前送出的紀錄
3. 點「編輯」，改交通費後按儲存，確認表格重新整理後金額已更新
4. 點「刪除」，確認確認對話框跳出，按下確定後該筆紀錄消失
5. 直接呼叫 `getMyRecords`（或重新整理頁面查詢）確認該筆確實不再出現

- [ ] **Step 3: Commit**

```bash
git add frontend/my.html
git commit -m "feat: 我的派工紀錄查詢/編輯/刪除頁"
```

---

### Task 16: 端對端手動驗證與 GitHub 發佈

**Files:**
- 無新檔案，僅驗證與發佈既有內容

**Interfaces:**
- 無

- [ ] **Step 1: 完整跑一輪 spec 的測試重點**

對照 spec 的「測試重點」，逐項手動驗證（都用 Task 9-15 部署好的網址與前端）：

1. SDI 單人派工：送出一筆，確認角色=Engineer、單價=9200
2. SDI 雙人派工：第一人新增派工（Engineer/9200），第二人在同一天選「加入既有派工」（應自動變 Worker/7000，且 DispatchNo/Project 與第一人相同）
3. HDC 派工：新增與加入既有派工都要能自選 Worker(8800)/Engineer(10200)
4. 同一天兩組不同派工（都各自新增），確認 DispatchNo 分別是 `...-A` 與 `...-B`
5. 工時非 4/8 小時：確認跳出確認訊息，不勾選無法送出；勾選「仍要送出」後可以送出
6. 我的紀錄：確認只能看到自己的紀錄；編輯/刪除當月紀錄成功
7. 跨月鎖定：在 `updateMyRecord`/`deleteMyRecord` 帶一筆非當月的 `recordId`（可手動把某筆的 Date 改到別月測試），確認回傳「沒有權限」錯誤
8. 金額欄位皆為未四捨五入的浮點數，與現有 Excel 範例算法一致

- [ ] **Step 2: 建立 GitHub repo 並推送**

```bash
gh repo create wei780622/dispatch-payment-tracker --private --source=. --remote=origin
git push -u origin main
```

- [ ] **Step 3: 開啟 GitHub Pages**

到 repo 的 Settings → Pages，Source 選 `main` 分支、`/frontend` 資料夾（或先把 `frontend/` 內容移到 repo 根目錄，依你偏好調整），儲存後記下 Pages 網址

- [ ] **Step 4: 最終驗證**

用手機瀏覽器打開 GitHub Pages 網址，重新跑一次 Step 1 的關鍵情境（至少「SDI 雙人派工」與「工時非 4/8 小時跳窗」兩項），確認正式環境行為正確

- [ ] **Step 5: Commit（若 Step 3 有調整檔案結構）**

```bash
git add -A
git commit -m "chore: 設定 GitHub Pages 發佈路徑"
git push
```

---

## Self-Review 紀錄

- **spec 覆蓋率**：spec 第 1-4 段（架構、Sheet 結構、雙人派工機制、欄位）對應 Task 1、6-9；第 5 段（金額公式）對應 Task 2-3、7；第 8 段（權限規則）對應 Task 6、12、16。第 6-7 段（管理後台、月結算匯出）刻意不在本計畫範圍內，留給後續計畫。
- **Placeholder 掃描**：已確認無 TBD/TODO，所有步驟皆附完整程式碼；`SPREADSHEET_ID`、`SCRIPT_URL` 兩處使用 `PUT_YOUR_..._HERE` 屬於「執行者需填入實際環境值」的合理留白，不是邏輯上的省略，已在對應任務的手動驗證步驟中明確說明何時、如何填入。
- **型別/命名一致性**：`HEADERS`、`rowObjectToArray`、`buildDispatchRecord`、`recalcRecordFields`、`findOpenDispatches`、`resolveRoleAndRate`、`canEditRecord` 等函式名稱與物件鍵值（含 `'mark up (5%)'` 這種帶空白的鍵）在 Task 4、6、7、10、11、12 中全部保持一致。
