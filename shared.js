const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyaxuLDXIKqF6G6jxOlrH73SLqNphpCp0htqwcISdMGmXGmDPiOSH6psEb5YKAUCHr6/exec';
const CALL_API_MAX_RETRIES = 2;
const CALL_API_RETRY_DELAY_MS = 800;

// Apps Script Web App 的 /exec 端點偶爾會間歇性地把請求誤導到 doGet()
// （回傳固定的 "API is running" 訊息，代表這次的 doPost 內容沒有真的被處理），
// 這是 Google 基礎設施層的已知間歇性問題，不是我們的程式碼觸發的。
// 這裡連同一般的網路錯誤／JSON 解析錯誤，一起做自動重試。
function isMisroutedToDoGet_(res) {
  return res && res.ok === true && res.message === 'Dispatch Payment Tracker API is running';
}

function delay_(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function callApiOnce_(action, payload) {
  return fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  }).then(function (res) { return res.json(); });
}

function callApi(action, payload, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = CALL_API_MAX_RETRIES;
  return callApiOnce_(action, payload).then(function (res) {
    if (isMisroutedToDoGet_(res) && retriesLeft > 0) {
      return delay_(CALL_API_RETRY_DELAY_MS).then(function () {
        return callApi(action, payload, retriesLeft - 1);
      });
    }
    return res;
  }).catch(function (err) {
    if (retriesLeft > 0) {
      return delay_(CALL_API_RETRY_DELAY_MS).then(function () {
        return callApi(action, payload, retriesLeft - 1);
      });
    }
    throw err;
  });
}

function getProjectFromUrl() {
  return new URLSearchParams(window.location.search).get('project');
}

// --- 載入中視覺回饋小工具（純顯示用，不影響任何資料邏輯）---
// callApi 遇到 Google 端間歇性變慢時會自動重試，等待時間可能拉長到好幾秒，
// 沒有任何提示的話畫面會看起來像當機。這裡統一處理三種情境：按鈕、下拉選單、表格區塊。

// 按鈕點下去到 API 回應之間，改成灰階＋文字提示；用法：
//   const restore = setBtnLoading(btn, '刪除中…');
//   callApi(...).then(...).finally(restore);
function setBtnLoading(btn, loadingText) {
  var original = btn.textContent;
  btn.disabled = true;
  btn.textContent = (loadingText || '處理中…');
  return function restore() {
    btn.disabled = false;
    btn.textContent = original;
  };
}

// 下拉選單資料還沒回來之前，先放一個反灰的「載入中…」選項，取代空白選單
function setSelectLoading(select) {
  select.disabled = true;
  select.innerHTML = '<option disabled selected>載入中…</option>';
}

function clearSelectLoading(select) {
  select.disabled = false;
  select.innerHTML = '';
}

// 表格/清單區塊重新整理時，先顯示「載入中…」而不是直接清空
function setTableLoading(tbody, colSpan) {
  tbody.innerHTML = '<tr><td colspan="' + colSpan + '" class="loadingRow"><span class="spinner"></span>載入中…</td></tr>';
}
