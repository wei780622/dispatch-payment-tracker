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

function formatDateYYMMDD(dateISO) {
  var parts = dateISO.split('-');
  return parts[0].slice(2) + parts[1] + parts[2];
}

function nextDispatchNo(records, dateISO, prefix) {
  var distinct = {};
  records.forEach(function (r) {
    if (r.type === '派工' && r.date === dateISO) {
      distinct[r.DispatchNo] = true;
    }
  });
  var count = Object.keys(distinct).length;
  if (count >= 26) {
    throw new Error('當天已達 26 組派工上限，無法再新增');
  }
  var letter = String.fromCharCode(65 + count);
  return prefix + '-' + formatDateYYMMDD(dateISO) + '-' + letter;
}

function resolveRoleAndRate(project, isJoiningExisting, chosenRole, rateTable) {
  var role;
  if (project === 'SDI') {
    role = isJoiningExisting ? 'Worker' : 'Engineer';
  } else if (project === 'HDC') {
    if (chosenRole !== 'Worker' && chosenRole !== 'Engineer') {
      throw new Error('HDC 派工需要選擇 chosenRole（Worker 或 Engineer）');
    }
    role = chosenRole;
  } else {
    throw new Error('未知的專案：' + project);
  }
  var projectRates = rateTable[project];
  if (!projectRates || typeof projectRates[role] !== 'number') {
    throw new Error('找不到 ' + project + '/' + role + ' 的單價設定');
  }
  return { role: role, rate: projectRates[role] };
}

function isSameMonth(dateISO, referenceISO) {
  return dateISO.slice(0, 7) === referenceISO.slice(0, 7);
}

function canEditRecord(record, requesterName, todayISO) {
  return record['姓名'] === requesterName &&
    record['狀態'] === '正常' &&
    isSameMonth(record['Date'], todayISO);
}

function findOpenDispatches(records, dateISO) {
  var groups = {};
  records.forEach(function (r) {
    if (r.type !== '派工' || r.date !== dateISO || r.status !== '正常') return;
    if (!groups[r.DispatchNo]) {
      groups[r.DispatchNo] = { dispatchNo: r.DispatchNo, project: r.Project, date: r.date, memberCount: 0, members: [] };
    }
    groups[r.DispatchNo].memberCount += 1;
    groups[r.DispatchNo].members.push(r.姓名 || r['姓名']);
  });
  return Object.keys(groups)
    .map(function (key) { return groups[key]; })
    .filter(function (g) { return g.memberCount < 2; });
}

function assertFiniteNumber_(value, fieldName) {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error('欄位 ' + fieldName + ' 必須是有效數字');
  }
}

function buildDispatchRecord(input, settings, existingRecords, nowISO) {
  if (!settings.hasOwnProperty(input.project)) {
    throw new Error('未知的專案：' + input.project);
  }
  assertFiniteNumber_(input.overtimeHours, '加班時數');
  assertFiniteNumber_(input.transportation, '交通費');
  assertFiniteNumber_(input.lodging, '住宿費');

  var hours = hoursFromTimes(input.startTime, input.endTime);
  if (!isStandardHours(hours) && !input.forceSubmit) {
    return { ok: false, needsConfirmation: true, hours: hours };
  }

  var dispatchNo, projectText;
  if (input.isJoiningExisting) {
    var openGroups = findOpenDispatches(existingRecords, input.date)
      .filter(function (g) { return g.dispatchNo === input.joinDispatchNo; });
    if (openGroups.length === 0) {
      throw new Error('找不到可加入的派工，或該派工已滿 2 人：' + input.joinDispatchNo);
    }
    if (openGroups[0].members.indexOf(input.name) !== -1) {
      throw new Error('您已經在這個派工中，無法重複加入：' + input.joinDispatchNo);
    }
    dispatchNo = input.joinDispatchNo;
    projectText = openGroups[0].project;
  } else {
    dispatchNo = nextDispatchNo(existingRecords, input.date, settings[input.project].prefix);
    projectText = input.newProjectText;
  }

  var roleRate = resolveRoleAndRate(input.project, input.isJoiningExisting, input.chosenRole, {
    SDI: settings.SDI.rates,
    HDC: settings.HDC.rates
  });

  var dayCount = days(hours);
  var taxEx = taxExcluded(roleRate.rate);
  var ot = overtimePay(roleRate.rate, input.overtimeHours);
  var mk = markup(roleRate.rate, dayCount);
  var svcSubtotal = serviceSubtotal(roleRate.rate, dayCount, input.overtimeHours);
  var tlSubtotal = transportLodgingSubtotal(input.transportation, input.lodging);
  var total = amount(svcSubtotal, tlSubtotal);

  var record = {
    'RecordID': null,
    '建立時間': nowISO,
    '修改時間': nowISO,
    '類型': '派工',
    'No': null,
    'DispatchNo': dispatchNo,
    'Project': projectText,
    'Date': input.date,
    '姓名': input.name,
    '角色': roleRate.role,
    '單價': roleRate.rate,
    '稅前單價': taxEx,
    '出發時間': input.departureTime,
    '上班時間': input.startTime,
    '下班時間': input.endTime,
    '工時': hours,
    '天數': dayCount,
    '加班時數': input.overtimeHours,
    '加班費': ot,
    'mark up (5%)': mk,
    '服務費小計': svcSubtotal,
    '交通費': input.transportation,
    '住宿費': input.lodging,
    '交通住宿小計': tlSubtotal,
    '合計': total,
    '狀態': '正常'
  };

  return { ok: true, needsConfirmation: false, record: record };
}

function recalcRecordFields(record, edits) {
  if (edits.overtimeHours !== undefined) assertFiniteNumber_(edits.overtimeHours, '加班時數');
  if (edits.transportation !== undefined) assertFiniteNumber_(edits.transportation, '交通費');
  if (edits.lodging !== undefined) assertFiniteNumber_(edits.lodging, '住宿費');

  var departureTime = edits.departureTime !== undefined ? edits.departureTime : record['出發時間'];
  var startTime = edits.startTime !== undefined ? edits.startTime : record['上班時間'];
  var endTime = edits.endTime !== undefined ? edits.endTime : record['下班時間'];
  var overtimeHours = edits.overtimeHours !== undefined ? edits.overtimeHours : record['加班時數'];
  var transportation = edits.transportation !== undefined ? edits.transportation : record['交通費'];
  var lodging = edits.lodging !== undefined ? edits.lodging : record['住宿費'];

  var hours = hoursFromTimes(startTime, endTime);
  if (!isStandardHours(hours) && !edits.forceSubmit) {
    return { ok: false, needsConfirmation: true, hours: hours };
  }

  var dayCount = days(hours);
  var rate = record['單價'];
  var taxEx = taxExcluded(rate);
  var ot = overtimePay(rate, overtimeHours);
  var mk = markup(rate, dayCount);
  var svcSubtotal = serviceSubtotal(rate, dayCount, overtimeHours);
  var tlSubtotal = transportLodgingSubtotal(transportation, lodging);
  var total = amount(svcSubtotal, tlSubtotal);

  var updated = Object.assign({}, record, {
    '出發時間': departureTime,
    '上班時間': startTime,
    '下班時間': endTime,
    '工時': hours,
    '天數': dayCount,
    '加班時數': overtimeHours,
    '加班費': ot,
    'mark up (5%)': mk,
    '服務費小計': svcSubtotal,
    '交通費': transportation,
    '住宿費': lodging,
    '交通住宿小計': tlSubtotal,
    '合計': total
  });

  return { ok: true, needsConfirmation: false, record: updated };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDateYYMMDD: formatDateYYMMDD,
    nextDispatchNo: nextDispatchNo,
    resolveRoleAndRate: resolveRoleAndRate,
    isSameMonth: isSameMonth,
    canEditRecord: canEditRecord,
    findOpenDispatches: findOpenDispatches,
    buildDispatchRecord: buildDispatchRecord,
    recalcRecordFields: recalcRecordFields
  };
}
