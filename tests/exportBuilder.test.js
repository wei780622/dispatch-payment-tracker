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
