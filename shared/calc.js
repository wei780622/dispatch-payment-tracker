function roundMoney_(value) {
  return Math.round(value * 100) / 100;
}

function taxExcluded(unitPrice) {
  return roundMoney_(unitPrice / 1.05);
}

function hoursFromTimes(startTime, endTime) {
  function toMinutes(t) {
    var parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  var diff = toMinutes(endTime) - toMinutes(startTime);
  if (diff < 0) diff += 24 * 60;
  var hours = Math.floor(diff / 60);
  if (hours >= 9) hours -= 1;
  return hours;
}

function days(hours) {
  return hours / 8;
}

function isStandardHours(hours) {
  return hours === 4 || hours === 8;
}

function overtimePay(unitPrice, overtimeHours) {
  return roundMoney_((taxExcluded(unitPrice) / 8) * overtimeHours * 1.34);
}

function markup(unitPrice, dayCount) {
  return roundMoney_(taxExcluded(unitPrice) * 0.05 * dayCount);
}

function serviceSubtotal(unitPrice, dayCount, overtimeHours) {
  return roundMoney_(taxExcluded(unitPrice) * dayCount + overtimePay(unitPrice, overtimeHours) + markup(unitPrice, dayCount));
}

function transportLodgingSubtotal(transportation, lodging) {
  return transportation + lodging;
}

function transportationTotal(fee, kilometers) {
  return fee + kilometers * 15;
}

function amount(serviceSubtotalValue, transportLodgingSubtotalValue) {
  return roundMoney_(serviceSubtotalValue + transportLodgingSubtotalValue);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    taxExcluded: taxExcluded,
    hoursFromTimes: hoursFromTimes,
    days: days,
    isStandardHours: isStandardHours,
    overtimePay: overtimePay,
    markup: markup,
    serviceSubtotal: serviceSubtotal,
    transportLodgingSubtotal: transportLodgingSubtotal,
    amount: amount,
    transportationTotal: transportationTotal
  };
}
