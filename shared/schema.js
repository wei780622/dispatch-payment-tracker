var HEADERS = [
  'RecordID', '建立時間', '修改時間', '類型', 'No', 'DispatchNo', 'Project', 'Date',
  '姓名', '角色', '單價', '稅前單價', '出發時間', '上班時間', '下班時間', '工時', '天數',
  '加班時數', '加班費', 'mark up (5%)', '服務費小計', '交通費', '住宿費', '交通住宿小計',
  '合計', '狀態', '案場名稱', '出發地', '抵達地', '途經', 'PDF網址', '公里數'
];

function rowObjectToArray(headers, obj) {
  return headers.map(function (h) {
    var value = obj[h];
    return (value === undefined || value === null) ? '' : value;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HEADERS: HEADERS, rowObjectToArray: rowObjectToArray };
}
