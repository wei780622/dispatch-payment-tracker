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
