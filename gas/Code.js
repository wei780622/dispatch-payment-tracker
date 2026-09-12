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
