#!/usr/bin/env node
/*
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>

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

/*jslint node:true */
(function () {
    'use strict';

    var fs = require('fs'),
        path = require('path'),
        root = path.join(path.dirname(fs.realpathSync(__filename)), '..'),
        esprima = require('esprima'),
        escodegen = require('escodegen'),
        estraverse = require('estraverse'),
        optionator,
        esmangle,
        common,
        argv;

    Error.stackTraceLimit = Infinity;

    esmangle = require(root);
    common = require(path.join(root, 'lib', 'common'));

    optionator = require('optionator')({
        prepend: 'Usage: esmangle file',
        append: 'Version ' + esmangle.version,
        helpStyle: {
            maxPadFactor: 2
        },
        options: [
            {
                option: 'help',
                alias: 'h',
                type: 'Boolean',
                description: 'show help',
                restPositional: true
            },
            {
                option: 'source-map',
                type: 'Boolean',
                description: 'dump source-map'
            },
            {
                option: 'preserve-completion-value',
                type: 'Boolean',
                description: 'preserve completion values if needed'
            },
            {
                option: 'preserve-license-comment',
                type: 'Boolean',
                description: 'preserve comments with @license, @preserve. But these comment may be lost if attached node is transformed or a comment isn\'t attached to any statement.'
            },
            {
                option: 'propagate-license-comment-to-header',
                type: 'Boolean',
                description: 'preserve comments with @license, @preserve. But these comment may be propagated to the script header.'
            },
            {
                option: 'output',
                alias: 'o',
                type: 'String',
                description: 'output file'
            }
        ]
    });

    argv = optionator.parse(process.argv);

    if (argv.help) {
        console.error(optionator.generateHelp());
        process.exit(0);
    }

    if (argv.preserveLicenseComment && argv.propagateLicenseCommentToHeader) {
        console.error('cannot specify --preserve-license-comment and --propagate-license-comment-to-header both');
        process.exit(1);
    }

    function output(code) {
        if (argv.output) {
            fs.writeFileSync(argv.output, code);
        } else {
            console.log(code);
        }
    }

    function compile(content, filename) {
        var tree, licenses, formatOption, preserveLicenseComment, propagateLicenseComment;

        preserveLicenseComment = argv.preserveLicenseComment;
        propagateLicenseComment = argv.propagateLicenseCommentToHeader;

        tree = esprima.parse(content, {
            loc: true,
            range: true,
            raw: true,
            tokens: true,
            comment: preserveLicenseComment || propagateLicenseComment
        });

        if (preserveLicenseComment || propagateLicenseComment) {
            licenses = tree.comments.filter(function (comment) {
                return /@(?:license|preserve)|copyright/i.test(comment.value);
            });
        }

        if (preserveLicenseComment) {
            // Attach comments to the tree.
            estraverse.attachComments(tree, licenses, tree.tokens);
        }

        tree = esmangle.optimize(tree, null, {
            destructive: true,
            directive: true,
            preserveCompletionValue: argv.preserveCompletionValue
        });
        tree = esmangle.mangle(tree, {
            destructive: true,
            distinguishFunctionExpressionScope: false
        });

        if (propagateLicenseComment) {
            tree.leadingComments = licenses;
        }

        formatOption = common.deepCopy(escodegen.FORMAT_MINIFY);
        formatOption.indent.adjustMultilineComment = true;

        return escodegen.generate(tree, {
            format: formatOption,
            sourceMap: argv.sourceMap && filename,
            directive: true,
            comment: preserveLicenseComment || propagateLicenseComment
        });
    }

    if (argv._.length === 0) {
        // no file is specified, so use stdin as input
        (function () {
            var code = '';
            process.stdin.on('data', function (data) {
                code += data;
            });
            process.stdin.on('end', function (err) {
                output(compile(code, 'stdin'));
            });
            process.stdin.resume();
        }());
    } else {
        argv._.forEach(function (filename) {
            var content, result;
            content = fs.readFileSync(filename, 'utf-8');
            result = compile(content, filename);
            output(result);
        });
    }
}());
/* vim: set sw=4 ts=4 et tw=80 : */
