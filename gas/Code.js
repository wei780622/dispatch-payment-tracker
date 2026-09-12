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

function handleGetOpenDispatches(payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(payload.project + '_紀錄');
  var records = readSheetAsObjects_(sheet).map(function (r) {
    return { type: r['類型'], date: formatDateForCompare_(r['Date']), status: r['狀態'], DispatchNo: r['DispatchNo'], Project: r['Project'] };
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
        DispatchNo: r['DispatchNo'], Project: r['Project']
      };
    });
}

function handlePreviewRecord(payload) {
  var settings = getSettings_();
  var existing = getRecordsForDispatchLogic_(payload.input.project, payload.input.date);
  return buildDispatchRecord(payload.input, settings, existing, new Date().toISOString());
}

function handleSubmitRecord(payload) {
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
    previewRecord: handlePreviewRecord,
    submitRecord: handleSubmitRecord
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
