module.exports = (grunt) ->
  grunt.initConfig
    coffee:
      compile:
        options:
          sourceMap: true
        expand: true
        flatten: false
        cwd: 'coffee'
        src: [ '**/*.coffee' ]
        dest: 'js/'
        ext: '.js'

      test:
        expand: true
        flatten: false
        cwd: 'spec-coffee'
        src: [ '**/*.coffee' ]
        dest: 'spec/'
        ext: '.js'

    requirejs:
      development:
        options:
          name: 'PriorityQueue'
          baseUrl: 'js/'
          optimize: 'none'
          out: './priority-queue.js'

      minified:
        options:
          name: 'PriorityQueue'
          baseUrl: 'js/'
          optimize: 'uglify2'
          out: './priority-queue.min.js'

      almond:
        options:
          name: 'index'
          baseUrl: 'js/'
          optimize: 'none'
          almond: true
          wrap: true
          out: './priority-queue.no-require.js'

      almond_minified:
        options:
          name: 'index'
          baseUrl: 'js/'
          optimize: 'uglify2'
          almond: true
          wrap: true
          out: './priority-queue.no-require.min.js'

    jasmine:
      all:
        src: 'js/**/*.js'
        options:
          specs: 'spec/**/*Spec.js'
          helpers: 'spec/**/*Helper.js'
          template: require('grunt-template-jasmine-requirejs')
          templateOptions:
            requireConfig:
              baseUrl: 'js/'

  grunt.loadNpmTasks('grunt-contrib-coffee')
  grunt.loadNpmTasks('grunt-requirejs')
  grunt.loadNpmTasks('grunt-contrib-jasmine')

  grunt.registerTask('default', [ 'coffee', 'requirejs' ])
  grunt.registerTask('test', [ 'coffee', 'jasmine' ])
