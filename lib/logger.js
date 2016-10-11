'use strict';

module.exports = {

    logger: null,

    log: (level, message) => {
        if(!module.exports.logger) {
            return;
        }

        module.exports.logger.log(level, message);
    }

};
