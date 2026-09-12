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
      '=G' + r + '/1.05',
      record['出發時間'],
      record['上班時間'],
      record['下班時間'],
      '=HOUR(K' + r + '-J' + r + ')',
      '=L' + r + '/8',
      record['加班時數'],
      '=(H' + r + '/8)*N' + r + '*1.34',
      '=H' + r + '*0.05*M' + r,
      '=(H' + r + '*M' + r + ')+P' + r + '+O' + r,
      record['交通費'],
      record['住宿費'],
      '=R' + r + '+S' + r,
      '=Q' + r + '+T' + r
    ];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterRecordsForExport: filterRecordsForExport,
    buildExportRows: buildExportRows
  };
}
