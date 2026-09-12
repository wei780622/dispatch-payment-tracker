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
