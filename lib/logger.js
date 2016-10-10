'use strict';

module.exports = {

    logger: null,

    log: (level, message) => {
        if(!this.logger) {
            return;
        }

        this.logger.log(level, message);
    }

};
