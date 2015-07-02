// At the command-line, call

// node browserify-with-package.js path/to/package/directory

// This will generate a browserified file, webppl.js, and an uglified version, webppl.min.js

var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;

// extract path to package from command-line args
var packagePath = path.join(process.cwd(), process.argv.slice(2)[0]);
var packageSpec = require(packagePath + '/package.json').webppl;

// use args to fill in some details in the mainIncludeWrapper.js script
// Have to read the webppl header code here, because the brfs tranform is dumb and
// needs the actual string to pattern-match on. Also have to require all external js
// headers here so that the browserify crawl can find them.

var wrapper = fs.readFileSync('src/mainIncludeWrapper.js', 'utf8');
wrapper = wrapper.replace(/PATHTOPACKAGE/g, '"'  + packagePath + '"');
wrapper = wrapper.replace(/PACKAGE/g, '"' + packagePath + '/package.json"');

var webpplHeaderCode = 'var webpplHeader = "";\n';

packageSpec.wppl.forEach(function(fileName) {
    var headerPath = packagePath + "/" + fileName;
    console.log(headerPath);
    webpplHeaderCode += ('webpplHeader = fs.readFileSync("' + headerPath + '", "utf8")'
			 + '+ ";" + webpplHeader;\n');
});

wrapper = wrapper.replace(/READANDAPPENDWEBPPLHEADERS/g, webpplHeaderCode);

var externalHeaderCode = 'var jsRequirements = [];\n';

packageSpec.external.forEach(function(fileName) {
    var fullPath = packagePath + '/' + fileName;
    var moduleName = fileName.split('.')[0];
    externalHeaderCode += ('jsRequirements = jsRequirements.concat([{name: "'
			   + moduleName +
			   '", mod : require("'
			   + fullPath +
			   '")}]);');
});

wrapper = wrapper.replace(/READANDAPPENDEXTERNALMODULES/g, externalHeaderCode);

// Write the newly generated code to a new file, which will be imported into main.js
fs.writeFileSync('src/additionalReqs.js', wrapper, 'utf8');

// Call browserify, output to desired location
var browserify_cmd = 'browserify -t brfs src/main.js > compiled/webppl.js';
exec(browserify_cmd, function(error, stdout, stderr) {
    console.log("done browserifying");
    if(error)
	console.log(error);
    // Once browserify is done, call uglify on the results;
    // Note these need to be nested like this because async
    var uglify_cmd = 'uglifyjs compiled/webppl.js -b ascii_only=true,beautify=false > compiled/webppl.min.js';
    exec(uglify_cmd, function(error, stdout, stderr) {
	console.log("done uglifying");
	if(error)
	    console.log(error);
    });
});
