const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../shared/settings.js');

test('DEFAULT_SETTINGS 內容符合 spec 單價表', () => {
  assert.deepEqual(settings.DEFAULT_SETTINGS, {
    SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
    HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
  });
});

test('parseSettingsRows：把 Sheet 二維陣列轉成設定物件', () => {
  const rows = [
    ['專案', 'Dispatch No. 前綴', 'Engineer 單價', 'Worker 單價'],
    ['SDI', 'PR26A014', 9200, 7000],
    ['HDC', 'PR26A014', 10200, 8800]
  ];
  assert.deepEqual(settings.parseSettingsRows(rows), {
    SDI: { prefix: 'PR26A014', rates: { Engineer: 9200, Worker: 7000 } },
    HDC: { prefix: 'PR26A014', rates: { Engineer: 10200, Worker: 8800 } }
  });
});

test('parseSettingsRows：忽略專案欄位空白的列', () => {
  const rows = [
    ['專案', 'Dispatch No. 前綴', 'Engineer 單價', 'Worker 單價'],
    ['SDI', 'PR26A014', 9200, 7000],
    ['', '', '', '']
  ];
  assert.deepEqual(Object.keys(settings.parseSettingsRows(rows)), ['SDI']);
});
