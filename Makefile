homepage.js : src/index.js ../editor/src/index.js
	browserify -t [babelify --presets [react] ] src/index.js -o homepage.js

mirror :
	rsync --exclude=".git" --exclude="node_modules/" -rLvz . corn:~/WWW/wp-site-core
