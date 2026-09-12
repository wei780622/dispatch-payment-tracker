const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../shared/calc.js');

test('taxExcluded：單價 9200 對應現有 SDI 範例的稅前單價（四捨五入到分，避免浮點數誤差）', () => {
  const result = calc.taxExcluded(9200);
  assert.equal(result, 8761.9);
});

test('taxExcluded：單價 7000／10200／8800（角色單價表，四捨五入到分）', () => {
  assert.equal(calc.taxExcluded(7000), 6666.67);
  assert.equal(calc.taxExcluded(10200), 9714.29);
  assert.equal(calc.taxExcluded(8800), 8380.95);
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

test('hoursFromTimes：全天班（含午休）原始工時達 9 小時要扣 1 小時午休', () => {
  assert.equal(calc.hoursFromTimes('08:30', '17:30'), 8);
  assert.equal(calc.hoursFromTimes('08:00', '17:00'), 8);
});

test('hoursFromTimes：原始工時超過 9 小時（例如加班）也是扣 1 小時午休', () => {
  assert.equal(calc.hoursFromTimes('08:00', '18:00'), 9);
});

test('hoursFromTimes：原始工時未滿 9 小時不扣午休', () => {
  assert.equal(calc.hoursFromTimes('08:00', '16:59'), 8);
});

test('hoursFromTimes：跨夜班（隔天結束）未滿 9 小時不扣午休，達 9 小時要扣', () => {
  assert.equal(calc.hoursFromTimes('22:00', '06:00'), 8);
  assert.equal(calc.hoursFromTimes('20:00', '08:00'), 11);
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

test('markup：單價 9200、天數 1 => 438.1（四捨五入到分，現有 SDI 範例）', () => {
  const result = calc.markup(9200, 1);
  assert.equal(result, 438.1);
});

test('serviceSubtotal：單價 9200、天數 1、無加班 => 9200（現有 SDI 範例，四捨五入後仍精確回到單價）', () => {
  const result = calc.serviceSubtotal(9200, 1, 0);
  assert.equal(result, 9200);
});

test('overtimePay：單價 9200、加班 2 小時 => 2935.24（四捨五入到分）', () => {
  const result = calc.overtimePay(9200, 2);
  assert.equal(result, 2935.24);
});

test('serviceSubtotal：單價 9200、天數 1、加班 2 小時 => 12135.24（四捨五入到分）', () => {
  const result = calc.serviceSubtotal(9200, 1, 2);
  assert.equal(result, 12135.24);
});

test('serviceSubtotal：不會再出現浮點數誤差尾數（例如 7998.999999999999）', () => {
  const result = calc.amount(calc.serviceSubtotal(7000, 1, 0), calc.transportLodgingSubtotal(0, 999));
  assert.equal(result, 7999);
});

test('transportLodgingSubtotal 與 amount：交通 3495、住宿 0 => 合計 12695（現有 SDI 範例）', () => {
  const tl = calc.transportLodgingSubtotal(3495, 0);
  assert.equal(tl, 3495);
  const total = calc.amount(9200, tl);
  assert.equal(total, 12695);
});
