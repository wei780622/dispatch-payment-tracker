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

test('buildExportRows：派工列產生正確的公式與數值（比對真實 SDI 範例）', () => {
  const records = [{
    'DispatchNo': 'PR26A014-260707-A', 'Project': '260707-(NHOA) Bigbattery', 'Date': '2026-07-07',
    '姓名': '林哲宇', '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0, '類型': '派工'
  }];
  const rows = exportBuilder.buildExportRows(records, 5);
  assert.deepEqual(rows, [[
    '', 1, 'PR26A014-260707-A', '260707-(NHOA) Bigbattery', '2026-07-07', '林哲宇', 9200,
    '=ROUND(G5/1.05,0)', '17:24', '08:30', '17:15', '=HOUR(MOD(K5-J5,1))', '=L5/8', 0,
    '=ROUND((H5/8)*N5*1.34,0)', '=ROUND(H5*0.05*M5,0)', '=ROUND((H5*M5)+P5+O5,0)', 3495, 0, '=R5+S5', '=ROUND(Q5+T5,0)'
  ]]);
});

test('buildExportRows：第二筆的公式要用正確的列號', () => {
  const records = [
    { 'DispatchNo': 'A', 'Project': 'p1', 'Date': '2026-07-07', '姓名': 'x', '單價': 9200, '出發時間': '', '上班時間': '08:00', '下班時間': '17:00', '加班時數': 0, '交通費': 0, '住宿費': 0, '類型': '派工' },
    { 'DispatchNo': 'B', 'Project': 'p2', 'Date': '2026-07-08', '姓名': 'y', '單價': 9200, '出發時間': '', '上班時間': '08:00', '下班時間': '17:00', '加班時數': 0, '交通費': 0, '住宿費': 0, '類型': '派工' }
  ];
  const rows = exportBuilder.buildExportRows(records, 5);
  assert.equal(rows[1][1], 2);
  assert.equal(rows[1][7], '=ROUND(G6/1.05,0)');
  assert.equal(rows[1][11], '=HOUR(MOD(K6-J6,1))');
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

test('buildFooterRows：Total/匯率/Final Total 公式與備註文字正確', () => {
  const rows = exportBuilder.buildFooterRows(5, 11, 31.62, '2026-07');
  assert.equal(rows.length, 4);
  assert.equal(rows[0][1], 'Total');
  assert.equal(rows[0][20], '=ROUND(SUM(U5:U11),0)');
  assert.equal(rows[1][1], 'EXCHANGE RATE (USD TO NTD)');
  assert.equal(rows[1][20], 31.62);
  assert.equal(rows[2][1], 'FINAL TOTAL');
  assert.equal(rows[2][20], '=ROUND(U12/U13,0)');
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
