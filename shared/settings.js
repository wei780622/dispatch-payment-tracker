var DEFAULT_SETTINGS = {
  SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
  HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
};

function parseSettingsRows(rows) {
  var result = {};
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var project = row[0];
    if (!project) continue;
    result[project] = {
      prefix: row[1],
      rates: { Engineer: Number(row[2]), Worker: Number(row[3]) }
    };
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_SETTINGS: DEFAULT_SETTINGS, parseSettingsRows: parseSettingsRows };
}
