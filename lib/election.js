var _ = require("lodash");

module.exports = function(praetor){

    praetor.legiond.on("node_added", function(node){
        var attributes = praetor.legiond.get_attributes();
        if(praetor.is_controlling_leader()){
            if(attributes.praetor.start_time > node.praetor.start_time)
                praetor.actions.demote();
            else{
               praetor.legiond.send({
                   event: "praetor.promotion"
               });
            }
        }
    });

    praetor.legiond.on("node_removed", function(node){
        var attributes = praetor.legiond.get_attributes();
        if(attributes.praetor.leader_eligible && node.praetor.leader)
            praetor.actions.elect();
    });

    praetor.actions.elect = function(){
        var attributes = praetor.legiond.get_attributes();
        var num_peers = praetor.legiond.get_peers().length;

        if(attributes.praetor.leader)
            return;
        else if(num_peers == 0)
            praetor.actions.promote();
        else{
            votes = [ { id: attributes.id } ]
            praetor.legiond.send({
                event: "praetor.ballot"
            });
        }
    }

    praetor.actions.promote = function(){
        var attributes = praetor.legiond.get_attributes();
        if(attributes.praetor.leader_eligible && !attributes.praetor.leader){
            var leader = {
                praetor: {
                    leader: true,
                    leader_eligible: true,
                    start_time: attributes.praetor.start_time
                }
            }
            praetor.legiond.set_attributes(leader);
            praetor.legiond.send({
                event: "praetor.promotion"
            });
            praetor.legiond.emit("promoted");
        }
    }

    praetor.actions.demote = function(){
        var attributes = praetor.legiond.get_attributes();
        attributes.praetor.leader = false;
        praetor.legiond.set_attributes(attributes);
        praetor.legiond.send({
            event: "praetor.demotion",
            data: attributes
        });
        praetor.legiond.emit("demoted");
    }

    var votes = [];
    var tie_election = null;
    var decision = null;

    praetor.legiond.on("praetor.ballot", function(message){
        var peers = _.indexBy(praetor.legiond.get_peers(), "id");
        if(_.isNull(decision) || !_.has(peers, decision.id))
            decision = message.author;

        praetor.legiond.send({
            event: "praetor.vote",
            data: {
                node: decision
            },
        }, message.author);
    });

    praetor.legiond.on("praetor.vote", function(message){
        var attributes = praetor.legiond.get_attributes();

        var num_peers = praetor.legiond.get_peers().length + 1;
        votes.push(message.data.node);

        var results = _.groupBy(votes, "id");

        if(votes.length == num_peers){
            var winner = null;
            var ties = [];
            _.each(results, function(nodes, node){
                if(_.isNull(winner))
                    winner = node;
                else if(nodes.length > results[winner].length){
                    winner = node;
                    ties = [];
                }
                else if(nodes.length == results[winner].length)
                    ties.push(node);
            });

            if(_.isEmpty(ties) && winner == attributes.id)
                praetor.actions.promote();
            else if(winner == attributes.id){
                var election_delay = _.random(5, true) * 1000;

                tie_election = setTimeout(function(){
                    praetor.actions.promote();
                }, election_delay);
            }
        }
        else if(results[attributes.id].length > (num_peers / 2))
            praetor.actions.promote();
    });

    praetor.legiond.on("praetor.promotion", function(message){
        decision = null;
        clearTimeout(tie_election);
        var node = _.indexBy(praetor.legiond.get_peers(), "id")[message.author.id];
        praetor.legiond.emit("leader_elected", message.author);
    });

    praetor.legiond.on("praetor.demotion", function(){
        praetor.actions.elect();
    });
}
