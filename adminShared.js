function getAdminPin() {
  return sessionStorage.getItem('adminPin') || '';
}

function setAdminPin(pin) {
  sessionStorage.setItem('adminPin', pin);
}

function clearAdminPin() {
  sessionStorage.removeItem('adminPin');
}

function adminCallApi(action, payload) {
  return callApi(action, Object.assign({ adminPin: getAdminPin() }, payload || {})).then(function (res) {
    if (!res.ok && res.error === '密碼錯誤') {
      clearAdminPin();
      alert('密碼錯誤，請重新輸入');
      location.reload();
    }
    return res;
  });
}
