SRCFILES = ../src/*.js \
		   ../src/header.wppl
MINIFIED = webppl.min.js
BROWSERIFIED = webppl.js

all: $(MINIFIED)

$(MINIFIED): $(BROWSERIFIED)
	uglifyjs $< -b ascii_only=true,beautify=false > $@

$(BROWSERIFIED): $(SRCFILES)
	browserify -t brfs $< > $@

clean:
	rm -f $(MINIFIED) $(BROWSERIFIED)