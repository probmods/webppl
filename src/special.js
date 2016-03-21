var gammaCof = [
  76.18009172947146,
  -86.50532032941677,
  24.01409824083091,
  -1.231739572450155,
  0.1208650973866179e-2,
  -0.5395239384953e-5];

function logGamma(xx) {
  var x = xx - 1.0;
  var tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  var ser = 1.000000000190015;
  for (var j = 0; j <= 5; j++) {
    x += 1;
    ser += gammaCof[j] / x;
  }
  return -tmp + Math.log(2.5066282746310005 * ser);
}

function digamma(x) {
  if (x < 6) {
    return digamma(x + 1) - 1 / x;
  }
  return Math.log(x) -
      1 / (2 * x) -
      1 / (12 * Math.pow(x, 2)) +
      1 / (120 * Math.pow(x, 4)) -
      1 / (252 * Math.pow(x, 6)) +
      1 / (240 * Math.pow(x, 8)) -
      5 / (660 * Math.pow(x, 10)) +
      691 / (32760 * Math.pow(x, 12)) -
      1 / (12 * Math.pow(x, 14));
}

module.exports = {
  logGamma: logGamma,
  digamma: digamma
};
