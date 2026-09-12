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

test('nextDispatchNo：已刪除紀錄的編號仍會被計入（同一天），避免字母被重複配發；其他日期的紀錄仍忽略', () => {
  const records = [
    { type: '派工', date: '2026-07-07', status: '已刪除', DispatchNo: 'PR26A014-260707-A' },
    { type: '派工', date: '2026-07-06', status: '正常', DispatchNo: 'PR26A014-260706-A' }
  ];
  const result = dispatch.nextDispatchNo(records, '2026-07-07', 'PR26A014');
  assert.equal(result, 'PR26A014-260707-B');
});

test('nextDispatchNo：當天已達 26 組派工上限時丟出錯誤', () => {
  const records = [];
  for (let i = 0; i < 26; i++) {
    records.push({ type: '派工', date: '2026-07-07', status: '正常', DispatchNo: 'PR26A014-260707-' + String.fromCharCode(65 + i) });
  }
  assert.throws(() => dispatch.nextDispatchNo(records, '2026-07-07', 'PR26A014'), /26 組派工上限/);
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

test('findOpenDispatches：回傳當天未滿 2 人的派工，且合併同一 DispatchNo', () => {
  const records = [
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: 'A案', 姓名: '莊志傳' },
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-B', Project: 'B案', 姓名: '林哲宇' },
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-B', Project: 'B案', 姓名: '古尚杰' }
  ];
  const result = dispatch.findOpenDispatches(records, '2026-08-03');
  assert.deepEqual(result, [
    { dispatchNo: 'PR26A014-260803-A', project: 'A案', date: '2026-08-03', memberCount: 1, members: ['莊志傳'] }
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
    siteName: '龍井廠', origin: '中華系統整合股份有限公司國分辦公室', destination: '台泥龍井廠',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 3495, kilometers: 0, lodging: 0, forceSubmit: false
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
  assert.equal(result.record['案場名稱'], '龍井廠');
  assert.equal(result.record['出發地'], '中華系統整合股份有限公司國分辦公室');
  assert.equal(result.record['抵達地'], '台泥龍井廠');
  assert.equal(result.record['途經'], '');
});

test('buildDispatchRecord：公里數會用每公里 15 元併入交通住宿小計/合計，但「交通費」「公里數」欄位各自保留原始輸入值（不會被合併覆蓋）', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 100, kilometers: 20, lodging: 0, forceSubmit: false
  };
  const result = dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.record['交通費'], 100);
  assert.equal(result.record['公里數'], 20);
  assert.equal(result.record['交通住宿小計'], 400);
  assert.equal(result.record['合計'], 9600);
});

test('buildDispatchRecord：SDI 加入既有派工 => Worker/7000，沿用 DispatchNo/Project', () => {
  const existing = [
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: '260803_USES Taya Longjing 2', 姓名: '莊志傳' }
  ];
  const input = {
    project: 'SDI', name: '古尚杰', date: '2026-08-03',
    isJoiningExisting: true, joinDispatchNo: 'PR26A014-260803-A', newProjectText: null,
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:20', startTime: '08:40', endTime: '17:20',
    overtimeHours: 0, transportation: 591, kilometers: 0, lodging: 0, forceSubmit: false
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
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:20', startTime: '08:40', endTime: '17:20',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-08-03T09:00:00.000Z'), /not open|不open|找不到|無法加入/);
});

test('buildDispatchRecord：加入已滿 2 人的派工要丟錯誤', () => {
  const existing = [
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: '260803_USES Taya Longjing 2', 姓名: '莊志傳' },
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: '260803_USES Taya Longjing 2', 姓名: '古尚杰' }
  ];
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-08-03',
    isJoiningExisting: true, joinDispatchNo: 'PR26A014-260803-A', newProjectText: null,
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:20', startTime: '08:40', endTime: '17:20',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, existing, '2026-08-03T09:00:00.000Z'), /not open|不open|找不到|無法加入|已滿/);
});

test('buildDispatchRecord：本人已經是該派工成員時，加入自己的派工要丟錯誤（避免重複領錢）', () => {
  const existing = [
    { type: '派工', date: '2026-08-03', status: '正常', DispatchNo: 'PR26A014-260803-A', Project: '260803_USES Taya Longjing 2', 姓名: '莊志傳' }
  ];
  const input = {
    project: 'SDI', name: '莊志傳', date: '2026-08-03',
    isJoiningExisting: true, joinDispatchNo: 'PR26A014-260803-A', newProjectText: null,
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:20', startTime: '08:40', endTime: '17:20',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, existing, '2026-08-03T09:00:00.000Z'), /您已經在這個派工中/);
});

test('buildDispatchRecord：未知的 project 要丟出清楚錯誤（不能讓 settings[project] 先炸掉）', () => {
  const input = {
    project: 'UNKNOWN', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /未知的專案/);
});

test('buildDispatchRecord：overtimeHours 非數字（null）要丟出清楚錯誤', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: null, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /加班時數|overtimeHours/);
});

test('buildDispatchRecord：transportation 非數字（字串）要丟出清楚錯誤', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 'abc', kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /交通費|transportation/);
});

test('buildDispatchRecord：kilometers 非數字（字串）要丟出清楚錯誤', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, kilometers: 'abc', lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /公里數/);
});

test('buildDispatchRecord：lodging 是 NaN 要丟出清楚錯誤', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: NaN, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /住宿費|lodging/);
});

test('buildDispatchRecord：工時非 4/8 小時且未強制送出 => 回傳 needsConfirmation', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '15:00', startTime: '08:30', endTime: '15:00',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
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
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '15:00', startTime: '08:30', endTime: '15:00',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: true
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
    siteName: '龍井廠', origin: '公司', destination: '工地',
    departureTime: '17:00', startTime: '08:00', endTime: '16:00',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
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

test('recalcRecordFields：舊資料沒有「公里數」欄位時預設為 0（不會因為缺欄位而出錯或多扣錢）', () => {
  const record = {
    'RecordID': 'r1', '姓名': '林哲宇', '單價': 9200, '狀態': '正常', 'Date': '2026-07-07',
    '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '工時': 8, '天數': 1, '加班時數': 0, '加班費': 0, 'mark up (5%)': 438.1,
    '服務費小計': 9200, '交通費': 100, '住宿費': 0, '交通住宿小計': 100, '合計': 9300
  };
  const result = dispatch.recalcRecordFields(record, { overtimeHours: 0, forceSubmit: false });
  assert.equal(result.ok, true);
  assert.equal(result.record['交通住宿小計'], 100);
});

test('recalcRecordFields：修改公里數會用每公里 15 元重新併入交通住宿小計，「交通費」欄位維持原始輸入值不被覆蓋', () => {
  const record = {
    'RecordID': 'r1', '姓名': '林哲宇', '單價': 9200, '狀態': '正常', 'Date': '2026-07-07',
    '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '工時': 8, '天數': 1, '加班時數': 0, '加班費': 0, 'mark up (5%)': 438.1,
    '服務費小計': 9200, '交通費': 100, '公里數': 0, '住宿費': 0, '交通住宿小計': 100, '合計': 9300
  };
  const result = dispatch.recalcRecordFields(record, { kilometers: 20, forceSubmit: false });
  assert.equal(result.ok, true);
  assert.equal(result.record['交通費'], 100);
  assert.equal(result.record['公里數'], 20);
  assert.equal(result.record['交通住宿小計'], 400);
});

test('recalcRecordFields：edits 帶入非數字的 kilometers 要丟出清楚錯誤', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '公里數': 0, '住宿費': 0
  };
  assert.throws(() => dispatch.recalcRecordFields(record, { kilometers: 'abc' }), /公里數/);
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

test('recalcRecordFields：改成非 4/8 小時但 forceSubmit=true => 照常重新試算', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  const result = dispatch.recalcRecordFields(record, { endTime: '15:00', forceSubmit: true });
  assert.equal(result.ok, true);
  assert.equal(result.record['工時'], 6);
});

test('recalcRecordFields：edits 帶入非數字的 overtimeHours 要丟出清楚錯誤', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  assert.throws(() => dispatch.recalcRecordFields(record, { overtimeHours: 'abc' }), /加班時數|overtimeHours/);
});

test('recalcRecordFields：edits 帶入非數字的 transportation 要丟出清楚錯誤', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  assert.throws(() => dispatch.recalcRecordFields(record, { transportation: null }), /交通費|transportation/);
});

test('recalcRecordFields：edits 帶入非數字的 lodging 要丟出清楚錯誤', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  assert.throws(() => dispatch.recalcRecordFields(record, { lodging: NaN }), /住宿費|lodging/);
});

test('recalcRecordFields：edits 未包含 overtimeHours/transportation/lodging 時，不驗證這些欄位（維持既有合法值即可通過）', () => {
  const record = {
    '單價': 9200, '出發時間': '17:24', '上班時間': '08:30', '下班時間': '17:15',
    '加班時數': 0, '交通費': 3495, '住宿費': 0
  };
  const result = dispatch.recalcRecordFields(record, { departureTime: '17:00' });
  assert.equal(result.ok, true);
});

test('buildDispatchRecord：途經多個地點會用 | 串接', () => {
  const input = {
    project: 'SDI', name: '林哲宇', date: '2026-07-07',
    isJoiningExisting: false, joinDispatchNo: null, newProjectText: '測試案',
    chosenRole: null,
    siteName: '龍井廠', origin: '公司', destination: '工地', viaPoints: ['休息站A', '休息站B'],
    departureTime: '17:24', startTime: '08:30', endTime: '17:15',
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
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
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
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
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
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
    overtimeHours: 0, transportation: 0, kilometers: 0, lodging: 0, forceSubmit: false
  };
  assert.throws(() => dispatch.buildDispatchRecord(input, settings, [], '2026-07-07T09:00:00.000Z'), /抵達地/);
});
