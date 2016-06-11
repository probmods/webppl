The homepage for webppl.org

This is a React app that uses CommonJS `require()` to include webppl-viz and webppl-editor and assumes that browserified webppl.js is available.

Build with `make build`

Dev notes:
- Tested with node 6 and npm v3 - not sure if works with earlier versions.
- We build webppl.js by checking out the dev branch, running `grunt browserify`, and copying the resulting file back into the `gh-pages` branch.
