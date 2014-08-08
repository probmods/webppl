/*
 * estemplate
 * https://github.com/RReverser/estemplate
 *
 * Copyright (c) 2014 Ingvar Stepanyan
 * Licensed under the MIT license.
 */

'use strict';

var parse = require('esprima').parse;
var traverse = require('estraverse').replace;
var reCode = /<%((=?)[\s\S]+?)%>/g;
var reInternalVar = /^__ASTER_DATA_\d+$/;
var reInternalMarker = /\"(__ASTER_DATA_\d+)\"/g;

function tmpl(str, options, data) {
	if (!data) {
		data = options;
		options = undefined;
	}

	return tmpl.compile(str, options)(data);
}

function isInternalVar(node) {
	return node.type === 'Identifier' && reInternalVar.test(node.name);
}

function isInternalStmt(node) {
	return node.type === 'ExpressionStatement' && reInternalVar.test(node.expression);
}

function isInternalBlock(node) {
	return node.type === 'BlockStatement' && node.body.length === 1 && reInternalVar.test(node.body[0]);
}

tmpl.compile = function (str, options) {
	var code = [],
		index = 0;

	var ast = parse(str.replace(reCode, function (_, codePart, isEval) {
		if (isEval) {
			var varName = '__ASTER_DATA_' + (index++);
			code.push('\tvar ' + varName + codePart);
			return varName;
		} else {
			code.push('\t' + codePart);
			return '';
		}
	}), options);

	ast = traverse(ast, {
		leave: function (node) {
			if (isInternalVar(node)) {
				return node.name;
			}

			if (isInternalStmt(node)) {
				return node.expression;
			}

			if (isInternalBlock(node)) {
				return node.body[0];
			}
		}
	});

	ast = JSON.stringify(ast, null, '\t').replace(reInternalMarker, function (_, name) {
		return name;
	});

	code.unshift(
		'with (data) {'
	);

	code.push(
		'}',
		'return ' + ast
	);

	return new Function('data', code.join('\n'));
};

module.exports = tmpl;