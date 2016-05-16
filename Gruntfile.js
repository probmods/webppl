'use strict';

var _ = require('underscore');
var open = require('open');
var child_process = require('child_process');

var jslintSettings = {
  options: {
    flags: ['--flagfile .gjslintrc'],
    reporter: {
      name: 'console'
    },
    force: false
  },
  lib: {
    src: [
      'Gruntfile.js',
      'src/header.wppl',
      'src/**/!(dists|enumerate|ScoreAggregator).js'
    ]
  },
  test: {
    src: ['tests/**/*.js']
  },
  wppl: {
    src: [
      'tests/test-data/**/*.wppl',
      'examples/*.wppl'
    ]
  }
};
module.exports = function(grunt) {
  grunt.initConfig({
    nodeunit: {
      all: ['tests/test-*.js']
    },
    jshint: {
      files: [
        'Gruntfile.js',
        'src/header.wppl',
        'src/**/*.js',
        'tests/**/*.js'
      ],
      options: {
        maxerr: 500,
        camelcase: true,
        nonew: true,
        curly: true,
        noarg: true,
        trailing: true,
        forin: true,
        noempty: true,
        node: true,
        eqeqeq: true,
        strict: false,
        evil: true,
        undef: true,
        bitwise: true,
        browser: true,
        gcl: true,
        newcap: false
      }
    },
    gjslint: jslintSettings,
    fixjsstyle: jslintSettings,
    clean: ['bundle/*.js'],
    watch: {
      ad: {
        files: ['**/*.ad.js'],
        tasks: ['build']
      }
    }
  });

  function browserifyArgs(args) {
    var pkgArg = '';
    var requires = _.chain(_.toArray(args))
        .map(function(name) { return ['--require', name]; })
        .flatten().value();
    pkgArg = ' -t [' + ['./src/bundle.js'].concat(requires).join(' ') + ']';
    return pkgArg + ' -g brfs src/browser.js -o bundle/webppl.js';
  }

  grunt.loadNpmTasks('grunt-gjslint');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('default', ['gjslint', 'nodeunit']);
  grunt.registerTask('test', ['nodeunit']);
  grunt.registerTask('lint', ['gjslint']);
  grunt.registerTask('hint', ['jshint']);
  grunt.registerTask('fixstyle', ['fixjsstyle']);
  grunt.registerTask('travis-phantomjs', ['bundle', 'test-phantomjs']);

  grunt.registerTask('build', 'Build WebPPL.', function() {
    var output = child_process.execSync('scripts/adify');
    grunt.log.writeln(output);
  });

  grunt.registerTask('build-watch', 'Run the build task on fs changes.', ['watch']);

  grunt.registerTask('bundle', 'Create browser bundle.', function() {
    var taskArgs = (arguments.length > 0) ? ':' + _.toArray(arguments).join(':') : '';
    grunt.task.run('browserify' + taskArgs, 'uglify');
  });

  grunt.registerTask('browserify', 'Generate "bundle/webppl.js".', function() {
    child_process.execSync('mkdir -p bundle');
    child_process.execSync('browserify' + browserifyArgs(arguments));
  });

  grunt.registerTask('browserify-watch', 'Run the browserify task on fs changes.', function() {
    var done = this.async();
    child_process.execSync('mkdir -p bundle');
    var args = '-v' + browserifyArgs(arguments);
    var p = child_process.spawn('watchify', args.split(' '));
    p.stdout.on('data', grunt.log.writeln);
    p.stderr.on('data', grunt.log.writeln);
    p.on('close', done);
  });

  grunt.registerTask('uglify', 'Generate "bundle/webppl.min.js".', function() {
    child_process.execSync('mkdir -p bundle');
    child_process.execSync('uglifyjs bundle/webppl.js -b ascii_only=true,beautify=false > bundle/webppl.min.js');
  });

  grunt.registerTask('test-browser', 'Run browser tests in default browser.', function() {
    open('tests/browser/index.html', process.env.BROWSER);
  });

  grunt.registerTask('test-phantomjs', 'Run browser tests in phantomjs.', function() {
    try {
      var cmd = 'phantomjs node_modules/qunit-phantomjs-runner/runner-list.js tests/browser/index.html';
      var output = child_process.execSync(cmd);
      grunt.log.writeln(output);
    } catch (e) {
      grunt.log.writeln(e.output.join('\n'));
      throw e;
    }
  });

  grunt.registerTask('generate-docs', 'Generate documentation.', function() {
    var output = child_process.execSync('scripts/distributionDocs > docs/distributions.rst');
    grunt.log.writeln(output);
  });
};
