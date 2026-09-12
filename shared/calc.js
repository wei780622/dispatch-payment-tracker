function taxExcluded(unitPrice) {
  return unitPrice / 1.05;
}

function hoursFromTimes(startTime, endTime) {
  function toMinutes(t) {
    var parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  var diff = toMinutes(endTime) - toMinutes(startTime);
  if (diff < 0) diff += 24 * 60;
  return Math.floor(diff / 60);
}

function days(hours) {
  return hours / 8;
}

function isStandardHours(hours) {
  return hours === 4 || hours === 8;
}

function overtimePay(unitPrice, overtimeHours) {
  return (taxExcluded(unitPrice) / 8) * overtimeHours * 1.34;
}

function markup(unitPrice, dayCount) {
  return taxExcluded(unitPrice) * 0.05 * dayCount;
}

function serviceSubtotal(unitPrice, dayCount, overtimeHours) {
  return taxExcluded(unitPrice) * dayCount + overtimePay(unitPrice, overtimeHours) + markup(unitPrice, dayCount);
}

function transportLodgingSubtotal(transportation, lodging) {
  return transportation + lodging;
}

function amount(serviceSubtotalValue, transportLodgingSubtotalValue) {
  return serviceSubtotalValue + transportLodgingSubtotalValue;
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
    amount: amount
  };
}
