/*
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*jslint bitwise:true */
(function () {
    'use strict';

    var Syntax,
        isArray,
        arrayFrom,
        arrayOf,
        has,
        sameValue,
        estraverse,
        escope,
        esutils;

    estraverse = require('estraverse');
    escope = require('escope');
    esutils = require('esutils');

    Syntax = estraverse.Syntax;

    isArray = Array.isArray;
    if (!isArray) {
        isArray = function isArray(array) {
            return Object.prototype.toString.call(array) === '[object Array]';
        };
    }

    function isObject(obj) {
        return typeof obj === 'object' && obj !== null;
    }

    has = (function () {
        var method = {}.hasOwnProperty;
        return function has(obj, prop) {
            return method.call(obj, prop);
        };
    }());

    // ES6 Array.from
    arrayFrom = (function () {
        var slice = Array.prototype.slice;
        return function arrayFrom(array) {
            return slice.call(array);
        };
    }());

    // ES6 Array.of
    arrayOf = (function () {
        var slice = Array.prototype.slice;
        return function arrayOf() {
            return slice.call(arguments);
        };
    }());

    function arrayLast(array) {
        return array[array.length - 1];
    }

    function arrayEmpty(array) {
        return array.length === 0;
    }

    function stringRepeat(str, num) {
        var result = '';

        for (num |= 0; num > 0; num >>>= 1, str += str) {
            if (num & 1) {
                result += str;
            }
        }

        return result;
    }

    // see http://wiki.ecmascript.org/doku.php?id=harmony:egal
    // ECMA262 SameValue algorithm
    if (Object.is) {
        sameValue = Object.is;
    } else {
        sameValue = function sameValue(x, y) {
            if (x === y) {
                // 0 === -0, but they are not identical
                return x !== 0 || 1 / x === 1 / y;
            }

            // NaN !== NaN, but they are identical.
            // NaNs are the only non-reflexive value, i.e., if x !== x,
            // then x is a NaN.
            // isNaN is broken: it converts its argument to number, so
            // isNaN("foo") => true
            return x !== x && y !== y;
        };
    }

    function deepCopy(obj) {
        function deepCopyInternal(obj, result) {
            var key, val;
            for (key in obj) {
                if (key.lastIndexOf('__', 0) === 0) {
                    continue;
                }
                if (obj.hasOwnProperty(key)) {
                    val = obj[key];
                    if (typeof val === 'object' && val !== null) {
                        if (val instanceof RegExp) {
                            val = new RegExp(val);
                        } else {
                            val = deepCopyInternal(val, isArray(val) ? [] : {});
                        }
                    }
                    result[key] = val;
                }
            }
            return result;
        }
        return deepCopyInternal(obj, isArray(obj) ? [] : {});
    }

    function assert(cond, text) {
        if (!cond) {
            throw new Error(text);
        }
    }

    function unreachable() {
        throw new Error('Unreachable point. logically broken.');
    }

    function isIdentifier(name) {
        // fallback for ES3
        if (esutils.keyword.isKeywordES5(name, true) || esutils.keyword.isRestrictedWord(name)) {
            return false;
        }

        return esutils.keyword.isIdentifierName(name);
    }

    function mayBeCompletionValue(node, ancestors) {
        var i, ancestor;

        if (node.type !== Syntax.ExpressionStatement) {
            return true;
        }

        for (i = ancestors.length - 1; i >= 0; --i, node = ancestor) {
            ancestor = ancestors[i];

            switch (ancestor.type) {
            case Syntax.FunctionExpression:
            case Syntax.FunctionDeclaration:
                return false;

            case Syntax.BlockStatement:
            case Syntax.Program:
                if (arrayLast(ancestor.body) !== node) {
                    return false;
                }
                break;

            case Syntax.SwitchCase:
                if (arrayLast(ancestor.consequent) !== node) {
                    return false;
                }
                break;
            }
        }

        return true;
    }

    function moveLocation(from, to) {
        if (from.loc == null) {
            return to;
        }
        to.loc = deepCopy(from.loc);
        return to;
    }

    function deleteLocation(node) {
        if (node.hasOwnProperty('loc')) {
            return delete node.loc;
        }
        return false;
    }

    function convertToEmptyStatement(node) {
        var i, iz, keys;
        keys = estraverse.VisitorKeys[node.type];
        for (i = 0, iz = keys.length; i < iz; ++i) {
            delete node[keys[i]];
        }
        node.type = Syntax.EmptyStatement;
        return node;
    }

    function isNegative(value) {
        return value === value && (value < 0 || (value === 0 && 1 / value < 0));
    }

    function isFunctionBody(node, parent) {
        return node.type === Syntax.BlockStatement && (parent.type === Syntax.FunctionDeclaration || parent.type === Syntax.FunctionExpression);
    }

    function isNumberLiteral(node) {
        return node.type === Syntax.Literal && typeof node.value === 'number';
    }

    function isOptimizedArgument(argument) {
        return isNumberLiteral(argument) && String(argument.value).length === 1;
    }

    function generateNegativeNode(value, node) {
        var result;
        result = {
            type: Syntax.UnaryExpression,
            operator: '-',
            argument: {
                type: Syntax.Literal,
                value: -value
            }
        };
        return (node) ? moveLocation(node, result) : result;
    }

    function isNegativeNode(node) {
        return node.type === Syntax.UnaryExpression && node.operator === '-' && isNumberLiteral(node.argument);
    }

    function generateUndefined(node) {
        var result = {
            type: Syntax.UnaryExpression,
            operator: 'void',
            argument: {
                type: Syntax.Literal,
                value: 0
            }
        };
        return (node) ? moveLocation(node, result) : result;
    }

    function isUndefined(node) {
        return node.type === Syntax.UnaryExpression && node.operator === 'void' && isOptimizedArgument(node.argument);
    }

    function generateNaN(node) {
        var result = {
            type: Syntax.BinaryExpression,
            operator: '/',
            left: {
                type: Syntax.Literal,
                value: 0
            },
            right: {
                type: Syntax.Literal,
                value: 0
            }
        };
        return (node) ? moveLocation(node, result) : result;
    }

    function isNaNNode(node) {
        if (node.type === Syntax.BinaryExpression) {
            if (isOptimizedArgument(node.left) && isOptimizedArgument(node.right)) {
                return node.left.value === 0 && node.right.value === 0;
            }
        }
        return false;
    }

    function generateFromValue(value) {
        if (typeof value === 'number') {
            if (isNaN(value)) {
                return generateNaN();
            }
            if (isNegative(value)) {
                return generateNegativeNode(value);
            }
        }
        if (value === undefined) {
            return generateUndefined();
        }
        return {
            type: Syntax.Literal,
            value: value
        };
    }

    function isReference(node) {
        var type = node.type;
        return type === Syntax.Identifier || type === Syntax.MemberExpression;
    }

    // @param last last element of SequenceExpression
    // @param parent parent element of SequenceExpression
    // @param scope scope
    function canExtractSequence(last, parent, scope) {
        var ref;
        if (parent.type === Syntax.CallExpression) {
            if (last.type === Syntax.Identifier) {
                if (last.name === 'eval') {
                    // This becomes direct call to eval.
                    return false;
                }
                ref = scope.resolve(last);
                return ref && ref.isStatic();
            }
            return last.type !== Syntax.MemberExpression;
        } else if (parent.type === Syntax.UnaryExpression) {
            if (parent.operator === 'delete') {
                return !isReference(last);
            } else if (parent.operator === 'typeof') {
                if (last.type === Syntax.Identifier) {
                    ref = scope.resolve(last);
                    return ref && ref.isStatic();
                }
            }
        } else if (parent.type === Syntax.UpdateExpression) {
            return !isReference(last);
        }
        return true;
    }

    function delegateVariableDeclarations(stmt, func) {
        var decls, target;

        decls = [];

        estraverse.traverse(stmt, {
            enter: function (node) {
                var i, iz, decl;
                if (node.type === Syntax.VariableDeclaration) {
                    if (node.kind === 'let' || node.kind === 'const') {
                        return;
                    }
                    for (i = 0, iz = node.declarations.length; i < iz; ++i) {
                        decl = node.declarations[i];
                        delete decl.init;
                        decls.push(decl);
                    }
                    return estraverse.VisitorOption.Skip;
                } else if (escope.Scope.isVariableScopeRequired(node)) {
                    return estraverse.VisitorOption.Skip;
                }
            }
        });

        if (!decls.length) {
            return null;
        }

        target = null;

        estraverse.traverse(func.body, {
            enter: function (node, parent) {
                if (node === stmt) {
                    return estraverse.VisitorOption.Skip;
                } else if (escope.Scope.isVariableScopeRequired(node)) {
                    return estraverse.VisitorOption.Skip;
                } else if (node.type === Syntax.VariableDeclaration && node.kind === 'var') {
                    // list is not allowed
                    if (parent.type !== Syntax.ForInStatement) {
                        target = node;
                        return estraverse.VisitorOption.Break;
                    }
                }
            }
        });

        if (target) {
            target.declarations = target.declarations.concat(decls);
            return null;
        } else {
            return {
                type: Syntax.VariableDeclaration,
                kind: 'var',
                declarations: decls
            };
        }
    }

    function isScopedDeclaration(node) {
        if (node.type === Syntax.VariableDeclaration && (node.kind === 'let' || node.kind === 'const')) {
            return true;
        } else if (node.type === Syntax.FunctionDeclaration) {
            return true;
        }
        return false;
    }

    exports.deepCopy = deepCopy;
    exports.stringRepeat = stringRepeat;
    exports.sameValue = sameValue;

    exports.Array = {
        isArray: isArray,
        from: arrayFrom,
        of: arrayOf,
        last: arrayLast,
        empty: arrayEmpty
    };

    exports.Object = {
        isObject: isObject,
        has: has
    };

    exports.Syntax = Syntax;
    exports.traverse = estraverse.traverse;
    exports.replace = estraverse.replace;
    exports.VisitorKeys = estraverse.VisitorKeys;
    exports.VisitorOption = estraverse.VisitorOption;

    exports.assert = assert;
    exports.unreachable = unreachable;

    exports.isIdentifier = isIdentifier;

    exports.moveLocation = moveLocation;
    exports.deleteLocation = deleteLocation;
    exports.convertToEmptyStatement = convertToEmptyStatement;

    exports.mayBeCompletionValue = mayBeCompletionValue;

    exports.isNegative = isNegative;

    exports.isFunctionBody = isFunctionBody;
    exports.SpecialNode = {
        generateNegative: generateNegativeNode,
        isNegative: isNegativeNode,
        generateUndefined: generateUndefined,
        isUndefined: isUndefined,
        generateNaN: generateNaN,
        isNaN: isNaNNode,
        isReference: isReference,
        canExtractSequence: canExtractSequence,
        generateFromValue: generateFromValue
    };

    exports.delegateVariableDeclarations = delegateVariableDeclarations;

    exports.isScopedDeclaration = isScopedDeclaration;
}());
/* vim: set sw=4 ts=4 et tw=80 : */
