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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { filterRecordsForExport: filterRecordsForExport };
}
