var replace = require('estraverse').replace;
var print = require('../util').print

function addFilenameMain(ast, filename) {
    return replace(ast, {
        enter: function(node) {
            node.loc.source = filename
            return node
        }
    });
}

module.exports = {
    addFilename: addFilenameMain
};