var Praetor = require([__dirname, "praetor"].join("/"));
var pkg = require([__dirname, "package"].join("/"));

module.exports = function(options){
    var praetor = new Praetor(options);
    praetor.version = pkg.version;
    return praetor;
}
