praetor
======

##About

###Description
praetor is a leader election framework built atop [legiond](https://github.com/growbrosops/legiond).

###Author
* Norman Joyner - <norman.joyner@gmail.com>

##Getting Started

###Installation
```npm install praetor```

###Configuration

##Features

###Standard Events
The following are standard events provided by praetor. These events supplement the standard events emitted by legiond.

* `leader_elected` - emits when a new leader is elected
* `promoted` - emits on a node when it becomes the cluster leader
* `demoted` - emits on a node when it is no longer the cluster leader
