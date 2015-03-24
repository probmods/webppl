SRCFILES = $(wildcard ../src/*.js) \
		   $(wildcard ../src/analysis/*.js) \
		   $(wildcard ../src/inference/*.js) \
		   $(wildcard ../src/transforms/*.js) \
		   ../src/header.wppl
MAINFILE = ../src/main.js
MINIFIED = webppl.min.js
BROWSERIFIED = webppl.js

all: $(MINIFIED)

$(MINIFIED): $(BROWSERIFIED)
	uglifyjs $< -b ascii_only=true,beautify=false > $@

$(BROWSERIFIED): $(SRCFILES)
	browserify -t brfs $(MAINFILE) > $@

clean:
	rm -f $(MINIFIED) $(BROWSERIFIED)