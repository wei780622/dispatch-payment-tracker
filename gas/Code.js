var SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet_(ss, name, headerRow) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headerRow);
  }
  return sheet;
}

function setupSheets() {
  var ss = getSpreadsheet_();
  ['SDI', 'HDC'].forEach(function (project) {
    getOrCreateSheet_(ss, project + '_紀錄', HEADERS);
    getOrCreateSheet_(ss, project + '_工程師', ['姓名', '啟用中']);
    getOrCreateSheet_(ss, project + '_案場', ['案場名稱', '地址', '啟用中']);
  });
  var settingsSheet = getOrCreateSheet_(ss, '設定', ['專案', 'Dispatch No. 前綴', 'Engineer 單價', 'Worker 單價']);
  if (settingsSheet.getLastRow() < 3) {
    settingsSheet.getRange(2, 1, 2, 4).setValues([
      ['SDI', DEFAULT_SETTINGS.SDI.prefix, DEFAULT_SETTINGS.SDI.rates.Engineer, DEFAULT_SETTINGS.SDI.rates.Worker],
      ['HDC', DEFAULT_SETTINGS.HDC.prefix, DEFAULT_SETTINGS.HDC.rates.Engineer, DEFAULT_SETTINGS.HDC.rates.Worker]
    ]);
  }
  Logger.log('setupSheets 完成');
}

function migrateAddRouteColumns() {
  var ss = getSpreadsheet_();
  var newColumns = ['案場名稱', '出發地', '抵達地', '途經', 'PDF網址'];
  ['SDI', 'HDC'].forEach(function (project) {
    var sheet = ss.getSheetByName(project + '_紀錄');
    var lastCol = sheet.getLastColumn();
    var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    newColumns.forEach(function (col) {
      if (existingHeaders.indexOf(col) === -1) {
        lastCol = lastCol + 1;
        sheet.getRange(1, lastCol).setValue(col);
      }
    });
    var sitesSheet = ss.getSheetByName(project + '_案場');
    if (!sitesSheet) {
      ss.insertSheet(project + '_案場').appendRow(['案場名稱', '地址', '啟用中']);
    }
  });
  Logger.log('migrateAddRouteColumns 完成');
}

function readSheetAsObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = values.slice(1);
  return rows.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function handleGetEngineers(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rows = readSheetAsObjects_(sheet);
  var engineers = rows
    .filter(function (r) { return r['啟用中'] === true || r['啟用中'] === 'TRUE'; })
    .map(function (r) { return r['姓名']; });
  return { ok: true, engineers: engineers };
}

function handleGetSites(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_案場');
  var rows = readSheetAsObjects_(sheet);
  var sites = rows
    .filter(function (r) { return r['啟用中'] === true || r['啟用中'] === 'TRUE'; })
    .map(function (r) { return { name: r['案場名稱'], address: r['地址'] }; });
  return { ok: true, sites: sites };
}

function handleGetOpenDispatches(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    return { type: r['類型'], date: formatDateForCompare_(r['Date']), status: r['狀態'], DispatchNo: r['DispatchNo'], Project: r['Project'], '姓名': r['姓名'] };
  });
  var openDispatches = findOpenDispatches(records, payload.date);
  return { ok: true, openDispatches: openDispatches };
}

function formatDateForCompare_(dateValue) {
  if (Object.prototype.toString.call(dateValue) === '[object Date]') {
    return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return dateValue;
}

function formatTimeForCompare_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  return value;
}

function getSettings_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('設定');
  var rows = sheet.getDataRange().getValues();
  return parseSettingsRows(rows);
}

function getRecordsForDispatchLogic_(project, dateISO) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(project + '_紀錄');
  return readSheetAsObjects_(sheet)
    .filter(function (r) { return formatDateForCompare_(r['Date']) === dateISO; })
    .map(function (r) {
      return {
        type: r['類型'], date: formatDateForCompare_(r['Date']), status: r['狀態'],
        DispatchNo: r['DispatchNo'], Project: r['Project'], '姓名': r['姓名']
      };
    });
}

function handlePreviewRecord(payload) {
  var settings = getSettings_();
  var existing = getRecordsForDispatchLogic_(payload.input.project, payload.input.date);
  return buildDispatchRecord(payload.input, settings, existing, new Date().toISOString());
}

function handleSubmitRecord(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var settings = getSettings_();
    var existing = getRecordsForDispatchLogic_(payload.input.project, payload.input.date);
    var result = buildDispatchRecord(payload.input, settings, existing, new Date().toISOString());
    if (!result.ok) {
      return result;
    }
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.input.project + '_紀錄');
    result.record['RecordID'] = Utilities.getUuid();
    result.record['No'] = sheet.getLastRow();
    var rowArray = rowObjectToArray(HEADERS, result.record);
    sheet.appendRow(rowArray);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function findRowIndexByRecordId_(sheet, recordId) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === recordId) {
      return i + 1; // Sheet 的列號從 1 開始，第 1 列是表頭
    }
  }
  return -1;
}

function rowToRecordObject_(sheet, rowIndex) {
  var rowValues = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  var obj = {};
  HEADERS.forEach(function (h, i) { obj[h] = rowValues[i]; });
  obj['Date'] = formatDateForCompare_(obj['Date']);
  obj['出發時間'] = formatTimeForCompare_(obj['出發時間']);
  obj['上班時間'] = formatTimeForCompare_(obj['上班時間']);
  obj['下班時間'] = formatTimeForCompare_(obj['下班時間']);
  return obj;
}

function handleGetMyRecords(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    r['Date'] = formatDateForCompare_(r['Date']);
    r['出發時間'] = formatTimeForCompare_(r['出發時間']);
    r['上班時間'] = formatTimeForCompare_(r['上班時間']);
    r['下班時間'] = formatTimeForCompare_(r['下班時間']);
    return r;
  });
  var filtered = records.filter(function (r) {
    return r['類型'] === '派工' &&
      r['姓名'] === payload.name &&
      r['狀態'] === '正常' &&
      r['Date'].slice(0, 7) === payload.yearMonth;
  });
  return { ok: true, records: filtered };
}

function handleUpdateMyRecord(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.project + '_紀錄');
    var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
    if (rowIndex === -1) {
      return { ok: false, error: '找不到紀錄：' + payload.recordId };
    }
    var record = rowToRecordObject_(sheet, rowIndex);
    var todayISO = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!canEditRecord(record, payload.name, todayISO)) {
      return { ok: false, error: '沒有權限編輯此紀錄' };
    }
    var result = recalcRecordFields(record, payload.edits || {});
    if (!result.ok) {
      return result;
    }
    result.record['修改時間'] = new Date().toISOString();
    var rowArray = rowObjectToArray(HEADERS, result.record);
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowArray]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteMyRecord(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.project + '_紀錄');
    var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
    if (rowIndex === -1) {
      return { ok: false, error: '找不到紀錄：' + payload.recordId };
    }
    var record = rowToRecordObject_(sheet, rowIndex);
    var todayISO = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!canEditRecord(record, payload.name, todayISO)) {
      return { ok: false, error: '沒有權限刪除此紀錄' };
    }
    var statusColumnIndex = HEADERS.indexOf('狀態') + 1;
    var modifiedColumnIndex = HEADERS.indexOf('修改時間') + 1;
    sheet.getRange(rowIndex, statusColumnIndex).setValue('已刪除');
    sheet.getRange(rowIndex, modifiedColumnIndex).setValue(new Date().toISOString());
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminGetRecords(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    r['Date'] = formatDateForCompare_(r['Date']);
    r['出發時間'] = formatTimeForCompare_(r['出發時間']);
    r['上班時間'] = formatTimeForCompare_(r['上班時間']);
    r['下班時間'] = formatTimeForCompare_(r['下班時間']);
    return r;
  });
  var filtered = records.filter(function (r) {
    if (!payload.includeDeleted && r['狀態'] === '已刪除') return false;
    if (payload.yearMonth && r['Date'].slice(0, 7) !== payload.yearMonth) return false;
    if (payload.name && r['姓名'] !== payload.name) return false;
    return true;
  });
  filtered.sort(function (a, b) {
    if (a['Date'] < b['Date']) return -1;
    if (a['Date'] > b['Date']) return 1;
    return 0;
  });
  return { ok: true, records: filtered };
}

function handleAdminUpdateRecord(payload) {
  assertAdminPin_(payload);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.project + '_紀錄');
    var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
    if (rowIndex === -1) {
      return { ok: false, error: '找不到紀錄：' + payload.recordId };
    }
    var record = rowToRecordObject_(sheet, rowIndex);
    var result = buildAdminRecordUpdate(record, payload.edits || {}, new Date().toISOString());
    if (!result.ok) {
      return result;
    }
    var rowArray = rowObjectToArray(HEADERS, result.record);
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowArray]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminDeleteRecord(payload) {
  assertAdminPin_(payload);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.project + '_紀錄');
    var rowIndex = findRowIndexByRecordId_(sheet, payload.recordId);
    if (rowIndex === -1) {
      return { ok: false, error: '找不到紀錄：' + payload.recordId };
    }
    var statusColumnIndex = HEADERS.indexOf('狀態') + 1;
    var modifiedColumnIndex = HEADERS.indexOf('修改時間') + 1;
    sheet.getRange(rowIndex, statusColumnIndex).setValue('已刪除');
    sheet.getRange(rowIndex, modifiedColumnIndex).setValue(new Date().toISOString());
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminAddFixedFee(payload) {
  assertAdminPin_(payload);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var record = buildFixedFeeRecord(payload.input, new Date().toISOString());
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(payload.project + '_紀錄');
    record['RecordID'] = Utilities.getUuid();
    record['No'] = sheet.getLastRow();
    var rowArray = rowObjectToArray(HEADERS, record);
    sheet.appendRow(rowArray);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminGetSettings(payload) {
  assertAdminPin_(payload);
  return { ok: true, settings: getSettings_() };
}

function handleAdminUpdateSettings(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('設定');
  var s = payload.settings;
  sheet.getRange(2, 1, 2, 4).setValues([
    ['SDI', s.SDI.prefix, s.SDI.rates.Engineer, s.SDI.rates.Worker],
    ['HDC', s.HDC.prefix, s.HDC.rates.Engineer, s.HDC.rates.Worker]
  ]);
  return { ok: true };
}

function handleAdminGetEngineers(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rows = readSheetAsObjects_(sheet);
  var engineers = rows.map(function (r) {
    return { name: r['姓名'], active: r['啟用中'] === true || r['啟用中'] === 'TRUE' };
  });
  return { ok: true, engineers: engineers };
}

function findNameRowIndex_(sheet, nameColumnHeader, name) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var col = headers.indexOf(nameColumnHeader);
  for (var i = 1; i < values.length; i++) {
    if (values[i][col] === name) return i + 1;
  }
  return -1;
}

function handleAdminAddEngineer(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rowIndex = findNameRowIndex_(sheet, '姓名', payload.name);
  if (rowIndex === -1) {
    sheet.appendRow([payload.name, true]);
  } else {
    sheet.getRange(rowIndex, 2).setValue(true);
  }
  return { ok: true };
}

function handleAdminToggleEngineer(payload) {
  assertAdminPin_(payload);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_工程師');
  var rowIndex = findNameRowIndex_(sheet, '姓名', payload.name);
  if (rowIndex === -1) {
    return { ok: false, error: '找不到工程師：' + payload.name };
  }
  sheet.getRange(rowIndex, 2).setValue(!!payload.active);
  return { ok: true };
}

function assertAdminPin_(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!expected || payload.adminPin !== expected) {
    throw new Error('密碼錯誤');
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonResponse_({ ok: true, message: 'Dispatch Payment Tracker API is running' });
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Invalid JSON payload' });
  }
  var handlers = {
    getEngineers: handleGetEngineers,
    getOpenDispatches: handleGetOpenDispatches,
    getSites: handleGetSites,
    previewRecord: handlePreviewRecord,
    submitRecord: handleSubmitRecord,
    getMyRecords: handleGetMyRecords,
    updateMyRecord: handleUpdateMyRecord,
    deleteMyRecord: handleDeleteMyRecord,
    adminGetRecords: handleAdminGetRecords,
    adminUpdateRecord: handleAdminUpdateRecord,
    adminDeleteRecord: handleAdminDeleteRecord,
    adminAddFixedFee: handleAdminAddFixedFee,
    adminGetSettings: handleAdminGetSettings,
    adminUpdateSettings: handleAdminUpdateSettings,
    adminGetEngineers: handleAdminGetEngineers,
    adminAddEngineer: handleAdminAddEngineer,
    adminToggleEngineer: handleAdminToggleEngineer
  };
  var handler = handlers[payload.action];
  if (!handler) {
    return jsonResponse_({ ok: false, error: 'Unknown action: ' + payload.action });
  }
  try {
    return jsonResponse_(handler(payload));
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}
