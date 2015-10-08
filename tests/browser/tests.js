'use strict';

QUnit.test('run', function(test) {
  webppl.run('Enumerate(flip)', function(s, erp) {
    test.ok(_.isEqual([false, true], erp.support().sort()));
  });
});

QUnit.test('compile', function(test) {
  test.ok(_.isString(webppl.compile('1 + 1')));
});

QUnit.test('cps', function(test) {
  var code = webppl.cps('100');
  eval(code)(function(val) {
    test.strictEqual(100, val);
  });
});

QUnit.test('naming', function(test) {
  var code = webppl.naming('100');
  test.strictEqual(100, eval(code)());
});
