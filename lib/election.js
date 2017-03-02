'use strict';

const logger = require('./logger');

const _ = require('lodash');

const PRAETOR_ELECTION_TIMEOUT_MS = process.env.PRAETOR_ELECTION_TIMEOUT_MS || 15000;

module.exports.Configure = function(praetor) {
    let election_timeout = null;

    function restart_election() {
        decision = null;
        clearTimeout(tie_election);
        logger.log('info', `The election process has timed out in ${PRAETOR_ELECTION_TIMEOUT_MS} milliseconds, restarting...`);
        praetor.actions.elect();
    }

    praetor.legiond.on('node_added', (node) => {
        const attributes = praetor.legiond.get_attributes();

        if(praetor.is_controlling_leader() && node.praetor.leader) {
            // The oldest leader wins!
            if(attributes.praetor.start_time > node.praetor.start_time) {
                praetor.actions.demote();
            } else {
                praetor.legiond.send({
                    event: 'praetor.promotion'
                }, node);
            }
        }
    });

    praetor.legiond.on('node_removed', (node) => {
        const attributes = praetor.legiond.get_attributes();

        // if the leader was removed, start an election
        if(attributes.praetor.leader_eligible && node.praetor.leader) {
            praetor.actions.elect();
        }
    });

    praetor.actions.elect = () => {
        logger.log('info', 'Starting leader election process');
        const attributes = praetor.legiond.get_attributes();
        const num_peers = praetor.legiond.get_peers().length;

        if(attributes.praetor.leader) {
            logger.log('debug', 'Already controlling leader node; refusing to start an election');
            return;
        } else if(num_peers === 0) {
            // only leader available, so elect
            logger.log('debug', 'No peers found; promoting myself to controlling leader');
            praetor.actions.promote();
        } else {
            election_timeout = setTimeout(restart_election, PRAETOR_ELECTION_TIMEOUT_MS);

            // Send a vote for this instance as a leader
            logger.log('debug', `${num_peers} peers found; starting election process`);
            votes = [ { id: attributes.id } ];
            praetor.legiond.send({
                event: 'praetor.ballot'
            });
        }
    };

    praetor.actions.promote = () => {
        clearTimeout(election_timeout);
        const attributes = praetor.legiond.get_attributes();

        if(attributes.praetor.leader_eligible && !attributes.praetor.leader) {
            const leader = {
                praetor: {
                    leader: true,
                    leader_eligible: true,
                    start_time: attributes.praetor.start_time
                }
            };

            praetor.legiond.set_attributes(leader);
            praetor.legiond.send({
                event: 'praetor.promotion'
            });
            praetor.legiond.emit('promoted');
        }
    };

    praetor.actions.demote = () => {
        const attributes = praetor.legiond.get_attributes();
        const praetor_attributes = { praetor: attributes.praetor };
        praetor_attributes.praetor.leader = false;
        praetor.legiond.set_attributes(praetor_attributes);
        praetor.legiond.send({
            event: 'praetor.demotion'
        });
        praetor.legiond.emit('demoted');
    };

    let votes = [];
    let tie_election = null;
    let decision = null;

    praetor.legiond.on('praetor.ballot', (message) => {
        const peers = _.indexBy(praetor.legiond.get_peers(), 'id');

        if(_.isNull(decision) || !_.has(peers, decision.id) || peers[decision.id].mode != 'leader') {
            decision = message.author;
        }

        praetor.legiond.send({
            event: 'praetor.vote',
            data: {
                node: decision
            }
        }, message.author);
    });

    praetor.legiond.on('praetor.vote', (message) => {
        const attributes = praetor.legiond.get_attributes();

        // peers does not include self, so we add 1 for full cluster size
        const num_peers = praetor.legiond.get_peers().length + 1;

        if(message.data.node.id === attributes.id) {
            logger.log('debug', `Received vote from ${message.author.id}`);
        }

        votes.push(message.data.node);

        const results = _.groupBy(votes, 'id');

        // if everyone voted
        if(votes.length === num_peers) {
            logger.log('debug', 'Received votes from all nodes; calculating election winner');
            let winner = null;
            let ties = [];

            /*
             *
             * Results: ->
             * leaderA: [ vote, vote ],
             * leaderB: [ vote ]
             *
             * check all votes to see if we have a clear winner
             */
            _.each(results, (nodes, node) => {
                // first node we see is winner until proven otherwise
                if(_.isNull(winner)) {
                    winner = node;
                }
                // if the current node has more votes, it is the new winner
                else if(nodes.length > results[winner].length) {
                    winner = node;
                    ties = [];
                }
                // if node has same amount of votes, there is a tie
                else if(nodes.length === results[winner].length) {
                    ties.push(node);
                }
            });

            // If we have no ties and I am the winner, promote myself
            if(_.isEmpty(ties) && winner === attributes.id) {
                logger.log('debug', 'Won election; promoting myself to controlling leader');
                praetor.actions.promote();
            }
            // If I am a winner but there is a tie, randomly select a winner based on timeout
            else if(winner === attributes.id) {
                logger.log('debug', `Election tied; following nodes have same amount of votes ${ties.join(' ')}. Selecting a winner based on election delay timeout`);
                const election_delay = _.random(5, true) * 1000;

                tie_election = setTimeout(() => {
                    praetor.actions.promote();
                }, election_delay);
            }
        }
        // I have received over half the votes, promote myself as leader
        else if(results[attributes.id].length > (num_peers / 2)) {
            logger.log('debug', `Received ${results[attributes.id].length} out of ${num_peers} votes (> 50%); promoting myself to controlling leader`);
            praetor.actions.promote();
        }
    });

    praetor.legiond.on('praetor.promotion', (message) => {
        decision = null;
        clearTimeout(tie_election);
        clearTimeout(election_timeout);

        if(praetor.is_controlling_leader()) {
            logger.log('debug', `New controlling leader: ${message.author}. Demoting myself`);
            praetor.actions.demote();
        }

        praetor.legiond.emit('leader_elected', message.author);
    });

    praetor.legiond.on('praetor.demotion', () => {
        const attributes = praetor.legiond.get_attributes();

        if(attributes.praetor.leader_eligible) {
            praetor.actions.elect();
        }
    });
};
