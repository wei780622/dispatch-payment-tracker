if (typeof require !== 'undefined') {
  var calcLib = require('./calc.js');
  var transportationTotal = calcLib.transportationTotal;
}

function filterRecordsForExport(records, yearMonth) {
  return records
    .filter(function (r) { return r['狀態'] === '正常' && r['Date'].slice(0, 7) === yearMonth; })
    .slice()
    .sort(function (a, b) {
      if (a['Date'] < b['Date']) return -1;
      if (a['Date'] > b['Date']) return 1;
      return 0;
    });
}

function buildExportRows(records, startRow) {
  return records.map(function (record, index) {
    var r = startRow + index;
    var no = index + 1;
    if (record['類型'] === '固定費用') {
      return ['', no, 'X', '', record['Date'], record['姓名'], '', '', '', '', '', '', '', '', '', '', '', '', '', '', record['合計']];
    }
    return [
      '',
      no,
      record['DispatchNo'],
      record['Project'],
      record['Date'],
      record['姓名'],
      record['單價'],
      '=ROUND(G' + r + '/1.05,0)',
      record['出發時間'],
      record['上班時間'],
      record['下班時間'],
      '=HOUR(MOD(K' + r + '-J' + r + ',1))',
      '=L' + r + '/8',
      record['加班時數'],
      '=ROUND((H' + r + '/8)*N' + r + '*1.34,0)',
      '=ROUND(H' + r + '*0.05*M' + r + ',0)',
      '=ROUND((H' + r + '*M' + r + ')+P' + r + '+O' + r + ',0)',
      transportationTotal(record['交通費'] || 0, record['公里數'] || 0),
      record['住宿費'],
      '=R' + r + '+S' + r,
      '=ROUND(Q' + r + '+T' + r + ',0)'
    ];
  });
}

function lastDayOfMonth_(yearMonth) {
  var parts = yearMonth.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildFooterRows(startRow, lastDataRow, exchangeRate, yearMonth) {
  var totalRow = lastDataRow + 1;
  var rateRow = lastDataRow + 2;
  var parts = yearMonth.split('-');
  var year = parts[0];
  var month = parseInt(parts[1], 10);
  var lastDay = lastDayOfMonth_(yearMonth);
  var noteText = '1. The exchange rate is based on the average daily exchange rate between USD and TWD from ' +
    year + '/' + month + '/1 to ' + year + '/' + month + '/' + lastDay +
    ', as provided by the Bank of Taiwan（台灣銀行）.';

  function blankRow() {
    var row = [];
    for (var i = 0; i < 21; i++) row.push('');
    return row;
  }

  var total = blankRow();
  total[1] = 'Total';
  total[20] = '=ROUND(SUM(U' + startRow + ':U' + lastDataRow + '),0)';

  var rate = blankRow();
  rate[1] = 'EXCHANGE RATE (USD TO NTD)';
  rate[20] = exchangeRate;

  var final = blankRow();
  final[1] = 'FINAL TOTAL';
  final[20] = '=ROUND(U' + totalRow + '/U' + rateRow + ',0)';

  var note = blankRow();
  note[1] = noteText;

  return [total, rate, final, note];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterRecordsForExport: filterRecordsForExport,
    buildExportRows: buildExportRows,
    buildFooterRows: buildFooterRows
  };
}
