var _ = require("lodash");
var EventEmitter = require("eventemitter2").EventEmitter2;
var LegionD = require("legiond");

function Praetor(options){
    var self = this;

    if(_.isUndefined(options))
        options = {};

    this.actions = {};
    this.events = {};

    this.options = _.defaults(options, {
        initial_delay: undefined,
        leader_eligible: true
    });

    if(!_.has(this.options, "legiond"))
        this.options.legiond = {};

    if(!_.has(this.options.legiond, "attributes"))
        this.options.legiond.attributes = {};

    this.options.legiond.attributes.praetor = {
        leader_eligible: this.options.leader_eligible,
        leader: false
    }

    this.legiond = new LegionD(this.options.legiond);

    if(_.isUndefined(this.options.initial_delay))
        this.options.initial_delay = this.legiond.options.network.tcp_timeout + 1000;

    require([__dirname, "lib", "election"].join("/"))(this);

    this.legiond.on("listening", function(){
        self.legiond.join("praetor.ballot");
        self.legiond.join("praetor.vote");
        self.legiond.join("praetor.promotion");
        self.legiond.join("praetor.demotion");

        if(self.options.leader_eligible){
            setTimeout(function(){
                var peers = self.legiond.get_peers();
                var leaders = _.filter(peers, function(peer){
                    if(peer.praetor.leader)
                        return peer;
                });

                if(_.isEmpty(leaders))
                    self.actions.elect();
            }, self.options.initial_delay)
        }
    });

    this.legiond.on("error", function(error){
        self.emit("error", error);
    });
}

Praetor.super_ = EventEmitter;
Praetor.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: Praetor,
        enumerable: false
    }
});

Praetor.prototype.promote = function(){
    this.actions.promote();
}

Praetor.prototype.demote = function(){
    this.actions.demote();
}

Praetor.prototype.get_controlling_leader = function(){
    var peers = this.legiond.get_peers();
    peers.push(this.legiond.get_attributes());
    var controlling_leaders = _.filter(peers, function(peer){
        return peer.praetor.leader;
    });

    return controllling_leaders[0];
}

Praetor.prototype.is_controlling_leader = function(){
    var attributes = this.legiond.get_attributes();
    return attributes.praetor.leader;
}

module.exports = Praetor;
