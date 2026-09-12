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

test('buildAdminRecordUpdate：固定費用列依 edits 更新對應中文欄位', () => {
  const record = {
    '類型': '固定費用', '姓名': 'Warehouse fee(Zhongli)', 'Date': '2026-07-30', '合計': 124210, '修改時間': '2026-07-30T10:00:00.000Z'
  };
  const result = adminRecords.buildAdminRecordUpdate(record, { amount: 999, description: '改過的說明' }, '2026-08-01T00:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['合計'], 999);
  assert.equal(result.record['姓名'], '改過的說明');
  assert.equal(result.record['修改時間'], '2026-08-01T00:00:00.000Z');
  assert.equal(result.record['Date'], '2026-07-30');
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
  assert.equal(result.record['稅前單價'], 6666.67);
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
