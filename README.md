The homepage for webppl.org

The homepage is a React app. Because of how React works, we can't just include viz and editor using `<script>` tags -- we have to bake them into our app using `require()` and browserify.

Recipes:
- Setting up: run `npm install`
- Building: `make build`
- Updating dependencies: update package.json with the newer dependencies (e.g., newer versions of viz or editor) and rerun `npm install` and `make build`
- Deploying: push to Github

Dev notes:
- Tested with node 6 and npm v3 - not sure if works with earlier versions.
