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
