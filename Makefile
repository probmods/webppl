homepage.js : src/index.js ../editor/src/index.js
	node_modules/browserify/bin/cmd.js -t [babelify --presets [react] ] src/index.js -o homepage.js

mirror :
	rsync --exclude=".git" --exclude="node_modules/" -rLvz . corn:~/WWW/wp-site-core

watch : src/index.js
	node_modules/watchify/bin/cmd.js -v -t [babelify --presets [react] ] src/index.js -o homepage.js
