SRCFILES = $(wildcard ../src/*.js) \
		   $(wildcard ../src/analysis/*.js) \
		   $(wildcard ../src/inference/*.js) \
		   $(wildcard ../src/transforms/*.js) \
		   ../src/header.wppl
MAINFILE = ../src/browser.js
MINIFIED = webppl.min.js
BROWSERIFIED = webppl.js
TESTS = ../tests/browser/index.html

all: $(MINIFIED)

$(MINIFIED): $(BROWSERIFIED)
	uglifyjs $< -b ascii_only=true,beautify=false > $@

$(BROWSERIFIED): $(SRCFILES)
	browserify -t brfs $(MAINFILE) > $@

test: $(BROWSERIFIED)
	node -e "require('open')(process.argv[1], process.env.BROWSER)" $(TESTS)

clean:
	rm -f $(MINIFIED) $(BROWSERIFIED)
