'use strict';

QUnit.test('run', function(test) {
  var done = test.async();
  webppl.run('Enumerate(flip)', function(s, dist) {
    test.ok(_.isEqual([false, true], dist.support().sort()));
    done();
  });
});

QUnit.test('run twice', function(test) {
  var done = test.async(2);
  _.times(2, function() {
    webppl.run('Enumerate(flip)', function(s, dist) {
      test.ok(_.isEqual([false, true], dist.support().sort()));
      done();
    });
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
