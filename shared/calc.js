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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { taxExcluded: taxExcluded, hoursFromTimes: hoursFromTimes, days: days, isStandardHours: isStandardHours };
}
