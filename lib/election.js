var _ = require("lodash");

module.exports = function(praetor){

    praetor.legiond.on("node_removed", function(node){
        if(node.praetor.leader_eligible)
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
            praetor.legiond.send("praetor.ballot", attributes);
        }
    }

    praetor.actions.promote = function(){
        var attributes = praetor.legiond.get_attributes();
        if(attributes.praetor.leader_eligible){
            attributes.praetor.leader = true;
            praetor.legiond.set_attributes(attributes);
            praetor.legiond.send("praetor.promotion", attributes);
            praetor.legiond.emit("promoted");
        }
    }

    praetor.actions.demote = function(){
        var attributes = praetor.legiond.get_attributes();
        attributes.praetor.leader = false;
        praetor.legiond.set_attributes(attributes);
        praetor.legiond.send("praetor.demotion", attributes);
        praetor.legiond.emit("demoted");
    }

    var votes = [];
    var tie_election = null;
    var decision = null;

    praetor.legiond.on("praetor.ballot", function(node){
        if(_.isNull(decision))
            decision = node;

        praetor.legiond.send("praetor.vote", {node: decision}, node);
    });

    praetor.legiond.on("praetor.vote", function(vote){
        var attributes = praetor.legiond.get_attributes();

        var num_peers = praetor.legiond.get_peers().length + 1;
        votes.push(vote.node);

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

    praetor.legiond.on("praetor.promotion", function(node){
        decision = null;
        clearTimeout(tie_election);
        praetor.legiond.emit("leader_elected", node);
    });

    praetor.legiond.on("praetor.demotion", function(){
        praetor.actions.elect();
    });
}
