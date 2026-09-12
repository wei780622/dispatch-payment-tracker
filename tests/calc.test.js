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
