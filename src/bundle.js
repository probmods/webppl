// A browserify plugin to include webppl packages in the browser bundle.

'use strict';

var path = require('path');
var assert = require('assert');
var through = require('through2');
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var _ = require('underscore');

var pkg = require('./pkg');
var util = require('./util');

var parseExpr = function(s) {
  return esprima.parse('(' + s + ')').body[0].expression;
};

var transform = function(code, opts) {

  var replace = _.partial(estraverse.replace, _, {
    enter: function(node, parent) {

      if (node.type === 'ArrayExpression' &&
          parent.type === 'VariableDeclarator' &&
          parent.id.type === 'Identifier' &&
          parent.id.name === 'packages') {
        assert(node.elements.length === 0);
        var exprs = util.asArray(opts.require).map(function(name_or_path) {
          return _.compose(parseExpr, pkg.stringify, pkg.read)(name_or_path);
        });

        return { type: node.type, elements: exprs };
      }

    }
  });

  var pipeline = _.compose(escodegen.generate, replace, esprima.parse);
  return pipeline(code);
};


module.exports = function(file, opts) {
  if (path.basename(file) !== 'browser.js') { return through(); }

  var code = '';
  return through(
      function(buf, enc, next) {
        code += buf;
        next();
      },
      function(next) {
        this.push(transform(code, opts));
        next();
      });
};
