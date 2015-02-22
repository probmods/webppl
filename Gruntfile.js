module.exports = function(grunt) {
  grunt.initConfig({
    gjslint: {
        options: {
          flags: [
            '--flagfile grunt_tasks/.gjslintrc'
          ],
          reporter: {
            name: 'console'
          },
          force: false
        },
        lib: {
          src: ['src/*.js', 'Gruntfile.js']
        },
        test: {
          src: ['tests/*.js']
        },
        wppl: {
          src: ['examples/*.wppl', 'tests/test-data/*.wppl'],
          additionalFlags: [
            '--disable 10,11',
            '--additional_extensions=wppl'
          ]
        }
    },
    fixjstyle: {
      options: {
        flags: [
          '--flagfile grunt_tasks/.gjslintrc'
        ],
        reporter: {
          name: 'console'
        },
        force: false
      },
      lib: {
        src: ['src/*.js', 'Gruntfile.js']
      },
      test: {
        src: ['tests/*.js']
      },
      wppl: {
        src: ['examples/*.wppl', 'tests/test-data/*.wppl'],
        additionalFlags: [
          '--disable 10,11',
          '--additional_extensions=wppl'
        ]
      }
    }
  });

  grunt.loadTasks('grunt_tasks');

  // Default task(s).
  grunt.registerTask('default', ['gjslint']);
};