homepage.js : src/index.js ../wp-editor/src/index.js
	browserify -t [babelify --presets [react] ] src/index.js -o homepage.js
