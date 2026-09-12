const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../shared/schema.js');

test('HEADERS 包含全部 32 個欄位，且順序固定', () => {
  assert.deepEqual(schema.HEADERS, [
    'RecordID', '建立時間', '修改時間', '類型', 'No', 'DispatchNo', 'Project', 'Date',
    '姓名', '角色', '單價', '稅前單價', '出發時間', '上班時間', '下班時間', '工時', '天數',
    '加班時數', '加班費', 'mark up (5%)', '服務費小計', '交通費', '住宿費', '交通住宿小計',
    '合計', '狀態', '案場名稱', '出發地', '抵達地', '途經', 'PDF網址', '公里數'
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
