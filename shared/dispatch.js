function formatDateYYMMDD(dateISO) {
  var parts = dateISO.split('-');
  return parts[0].slice(2) + parts[1] + parts[2];
}

function nextDispatchNo(records, dateISO, prefix) {
  var distinct = {};
  records.forEach(function (r) {
    if (r.type === '派工' && r.date === dateISO && r.status === '正常') {
      distinct[r.DispatchNo] = true;
    }
  });
  var count = Object.keys(distinct).length;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDateYYMMDD: formatDateYYMMDD,
    nextDispatchNo: nextDispatchNo,
    resolveRoleAndRate: resolveRoleAndRate,
    isSameMonth: isSameMonth,
    canEditRecord: canEditRecord
  };
}
