const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyaxuLDXIKqF6G6jxOlrH73SLqNphpCp0htqwcISdMGmXGmDPiOSH6psEb5YKAUCHr6/exec';

function callApi(action, payload) {
  return fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  }).then(function (res) { return res.json(); });
}

function getProjectFromUrl() {
  return new URLSearchParams(window.location.search).get('project');
}
