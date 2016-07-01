'use strict';

const _ = require('lodash');

module.exports.Configure = function(praetor) {

    praetor.legiond.on('node_added', (node) => {
        const attributes = praetor.legiond.get_attributes();

        if(praetor.is_controlling_leader()) {
            // The oldest leader wins!
            if(attributes.praetor.start_time > node.praetor.start_time) {
                praetor.actions.demote();
            } else {
                praetor.legiond.send({
                    event: 'praetor.promotion'
                });
            }
        }
    });

    praetor.legiond.on('node_removed', (node) => {
        const attributes = praetor.legiond.get_attributes();

        if(attributes.praetor.leader_eligible && node.praetor.leader) {
            praetor.actions.elect();
        }
    });

    praetor.actions.elect = () => {
        const attributes = praetor.legiond.get_attributes();
        const num_peers = praetor.legiond.get_peers().length;

        if(attributes.praetor.leader) {
            return;
        } else if(num_peers == 0) {
            // only leader available, so elect
            praetor.actions.promote();
        } else {
            // Send a vote for this instance as a leader
            votes = [ { id: attributes.id } ];
            praetor.legiond.send({
                event: 'praetor.ballot'
            });
        }
    };

    praetor.actions.promote = () => {
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
        attributes.praetor.leader = false;
        praetor.legiond.set_attributes(attributes);
        praetor.legiond.send({
            event: 'praetor.demotion',
            data: attributes
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

        votes.push(message.data.node);

        const results = _.groupBy(votes, 'id');

        // if everyone voted
        if(votes.length === num_peers) {
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
                // first node we see if winner until proven otherwise
                if(_.isNull(winner)) {
                    winner = node;
                }
                // if the current node has more votes, it is the new winner
                else if(nodes.length > results[winner].length){
                    winner = node;
                    ties = [];
                }
                // if node has same amount of votes, there is a tie
                else if(nodes.length == results[winner].length) {
                    ties.push(node);
                }
            });

            // If we have no ties and I am the winner, promote myself
            if(_.isEmpty(ties) && winner == attributes.id) {
                praetor.actions.promote();
            }
            // If I am a winner but there is a tie, randomly select a winner based on timeout
            else if(winner == attributes.id) {
                const election_delay = _.random(5, true) * 1000;

                tie_election = setTimeout(() => {
                    praetor.actions.promote();
                }, election_delay);
            }
        }
        // I have received over half the votes, promote myself as leader
        else if(results[attributes.id].length > (num_peers / 2)) {
            praetor.actions.promote();
        }
    });

    praetor.legiond.on('praetor.promotion', (message) => {
        decision = null;
        clearTimeout(tie_election);
        praetor.legiond.emit('leader_elected', message.author);
    });

    praetor.legiond.on('praetor.demotion', () => {
        praetor.actions.elect();
    });
};
