
build : index.js

# Eventually, make this take all the js files as dependencies
index.js : js/index.js node_modules
	../../node_modules/browserify/bin/cmd.js -t [babelify --presets [react] ] -t brfs js/index.js -o index.js

node_modules : ../../package.json
	npm install