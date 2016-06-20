SHELL=/bin/bash
ORIGBRANCH=$(shell git rev-parse --abbrev-ref HEAD)
WEBPPLVERSION=$(shell cat webppl-version.txt)

build : homepage.js webppl-viz.css webppl-editor.css webppl.js

homepage.js : src/index.js ../editor/src/index.js node_modules
	node_modules/browserify/bin/cmd.js -t [babelify --presets [react] ] -t brfs src/index.js -o homepage.js

mirror :
	rsync --exclude=".git" --exclude="node_modules/" -rLvz . corn:~/WWW/wp-site-core

webppl-viz.css : node_modules/webppl-viz/src/style.css node_modules
	cp "$<" "$@"

webppl-editor.css: node_modules node_modules/webppl-editor/src/component.css node_modules/codemirror/lib/codemirror.css
	cat node_modules/webppl-editor/src/component.css node_modules/codemirror/lib/codemirror.css > "$@"

watch : src/index.js node_modules
	node_modules/watchify/bin/cmd.js -v -t [babelify --presets [react] ] src/index.js -o homepage.js

node_modules : package.json
	npm install

webppl.js : webppl-version.txt
	mv node_modules node_modules_gh_pages
	git checkout $(WEBPPLVERSION)
	npm install
	grunt browserify
	mv bundle/webppl.js new-webppl.js
	git checkout $(ORIGBRANCH)
	rm -rf node_modules
	mv node_modules_gh_pages node_modules
	rm -f webppl.js
	mv new-webppl.js webppl.js
