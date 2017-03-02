'use strict';

const election = require('./lib/election');
const logger = require('./lib/logger');

const _ = require('lodash');
const EventEmitter = require('eventemitter2').EventEmitter2;
const LegionD = require('legiond');

class Praetor extends EventEmitter {
    constructor(options) {
        super();

        this.actions = {};
        this.events = {};

        this.options = options || {};
        this.options = _.defaults(options, {
            initial_delay: undefined,
            leader_eligible: true
        });

        if(this.options.logger) {
            logger.logger = this.options.logger;
        }

        this.options.legiond = this.options.legiond || {};
        this.options.legiond.attributes = this.options.legiond.attributes || {};

        this.options.legiond.attributes.praetor = {
            start_time: new Date().valueOf(),
            leader_eligible: this.options.leader_eligible,
            leader: false
        };

        this.legiond = new LegionD(this.options.legiond);
        this.options.initial_delay = this.legiond.network.options.tcp_timeout + 1000;
        election.Configure(this);

        const self = this;

        this.legiond.on('listening', () => {
            self.legiond.join('praetor.ballot');
            self.legiond.join('praetor.promotion');
            self.legiond.join('praetor.demotion');

            if(self.options.leader_eligible) {
                self.legiond.join('praetor.vote');

                setTimeout(() => {
                    const peers = self.legiond.get_peers();
                    const leaders = _.filter(peers, peer => peer.praetor && peer.praetor.leader);

                    if(_.isEmpty(leaders)) {
                        self.actions.elect();
                    }
                }, self.options.initial_delay);
            }
        });

        this.legiond.on('error', (error) => {
            self.emit('error', error);
        });
    }

    promote() {
        this.actions.promote();
    }

    demote() {
        this.actions.demote();
    }

    get_controlling_leader() {
        const peers = this.legiond.get_peers();
        peers.push(this.legiond.get_attributes());

        const sorted_controlling_leaders = _.chain(peers)
            .filter(peer => peer.praetor && peer.praetor.leader)
            .sortBy(leader => leader.praetor.start_time)
            .value();

        return sorted_controlling_leaders[0];
    }

    is_controlling_leader() {
        const attributes = this.legiond.get_attributes();

        return attributes.praetor.leader;
    }
}
module.exports = Praetor;
