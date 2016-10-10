'use strict';

const pkg = require('./package.json');
const Praetor = require('./praetor');

module.exports = function(options) {
    const praetor = new Praetor(options);
    praetor.version = pkg.version;

    return praetor;
};
