function assertFiniteNumber_(value, fieldName) {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error('欄位 ' + fieldName + ' 必須是有效數字');
  }
}

function assertNonEmptyString_(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('欄位 ' + fieldName + ' 不可為空');
  }
}

function buildFixedFeeRecord(input, nowISO) {
  assertNonEmptyString_(input.date, 'Date');
  assertNonEmptyString_(input.description, '費用說明');
  assertFiniteNumber_(input.amount, '金額');

  return {
    'RecordID': null,
    '建立時間': nowISO,
    '修改時間': nowISO,
    '類型': '固定費用',
    'No': null,
    'DispatchNo': 'X',
    'Project': '',
    'Date': input.date,
    '姓名': input.description,
    '角色': '',
    '單價': '',
    '稅前單價': '',
    '出發時間': '',
    '上班時間': '',
    '下班時間': '',
    '工時': '',
    '天數': '',
    '加班時數': '',
    '加班費': '',
    'mark up (5%)': '',
    '服務費小計': '',
    '交通費': '',
    '住宿費': '',
    '交通住宿小計': '',
    '合計': input.amount,
    '狀態': '正常',
    '案場名稱': '',
    '出發地': '',
    '抵達地': '',
    '途經': '',
    'PDF網址': ''
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildFixedFeeRecord: buildFixedFeeRecord };
}
