if (typeof require !== 'undefined') {
  var calcLib = require('./calc.js');
  var taxExcluded = calcLib.taxExcluded;
  var hoursFromTimes = calcLib.hoursFromTimes;
  var days = calcLib.days;
  var isStandardHours = calcLib.isStandardHours;
  var overtimePay = calcLib.overtimePay;
  var markup = calcLib.markup;
  var serviceSubtotal = calcLib.serviceSubtotal;
  var transportLodgingSubtotal = calcLib.transportLodgingSubtotal;
  var amount = calcLib.amount;
}

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

function buildAdminRecordUpdate(record, edits, nowISO) {
  if (record['類型'] === '固定費用') {
    var updatedFee = Object.assign({}, record, { '修改時間': nowISO });
    if (edits.date !== undefined) {
      assertNonEmptyString_(edits.date, 'Date');
      updatedFee['Date'] = edits.date;
    }
    if (edits.description !== undefined) {
      assertNonEmptyString_(edits.description, '費用說明');
      updatedFee['姓名'] = edits.description;
    }
    if (edits.amount !== undefined) {
      assertFiniteNumber_(edits.amount, '金額');
      updatedFee['合計'] = edits.amount;
    }
    return { ok: true, needsConfirmation: false, record: updatedFee };
  }

  if (edits.overtimeHours !== undefined) assertFiniteNumber_(edits.overtimeHours, '加班時數');
  if (edits.transportation !== undefined) assertFiniteNumber_(edits.transportation, '交通費');
  if (edits.lodging !== undefined) assertFiniteNumber_(edits.lodging, '住宿費');
  if (edits.unitPrice !== undefined) assertFiniteNumber_(edits.unitPrice, '單價');

  var merged = Object.assign({}, record);
  if (edits.date !== undefined) merged['Date'] = edits.date;
  if (edits.dispatchNo !== undefined) merged['DispatchNo'] = edits.dispatchNo;
  if (edits.project !== undefined) merged['Project'] = edits.project;
  if (edits.role !== undefined) merged['角色'] = edits.role;
  if (edits.unitPrice !== undefined) merged['單價'] = edits.unitPrice;
  if (edits.departureTime !== undefined) merged['出發時間'] = edits.departureTime;
  if (edits.startTime !== undefined) merged['上班時間'] = edits.startTime;
  if (edits.endTime !== undefined) merged['下班時間'] = edits.endTime;
  if (edits.overtimeHours !== undefined) merged['加班時數'] = edits.overtimeHours;
  if (edits.transportation !== undefined) merged['交通費'] = edits.transportation;
  if (edits.lodging !== undefined) merged['住宿費'] = edits.lodging;

  var hours = hoursFromTimes(merged['上班時間'], merged['下班時間']);
  if (!isStandardHours(hours) && !edits.forceSubmit) {
    return { ok: false, needsConfirmation: true, hours: hours };
  }

  var dayCount = days(hours);
  var rate = merged['單價'];
  var taxEx = taxExcluded(rate);
  var ot = overtimePay(rate, merged['加班時數']);
  var mk = markup(rate, dayCount);
  var svcSubtotal = serviceSubtotal(rate, dayCount, merged['加班時數']);
  var tlSubtotal = transportLodgingSubtotal(merged['交通費'], merged['住宿費']);
  var total = amount(svcSubtotal, tlSubtotal);

  var updated = Object.assign({}, merged, {
    '稅前單價': taxEx,
    '工時': hours,
    '天數': dayCount,
    '加班費': ot,
    'mark up (5%)': mk,
    '服務費小計': svcSubtotal,
    '交通住宿小計': tlSubtotal,
    '合計': total,
    '修改時間': nowISO
  });

  return { ok: true, needsConfirmation: false, record: updated };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildFixedFeeRecord: buildFixedFeeRecord,
    buildAdminRecordUpdate: buildAdminRecordUpdate
  };
}
