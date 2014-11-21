var util = require("util");
var helpers = require("./nimrodhelpers");

function RSHelpers(conn) {

  this.initiate = function(conf) {
    return helpers.cleanupDocs(
      helpers.runAdminCommand(conn, { "replSetInitiate" : conf })
    );
  };

  this.conf = function () {
    conn.db.db("local").collection("system.replset").findOne({}, conn.flow.add());
    return helpers.cleanupDocs(conn.flow.wait());
  };

  this.reconfig = function(cfg, options) {
    cfg.version = this.conf().version + 1;
    var cmd = { "replSetReconfig": cfg };
    for (var i in options) {
      cmd[i] = options[i];
    }
    return helpers.cleanupDocs(helpers.runAdminCommand(conn, cmd));
  };

  this.freeze = function (secs) {
    return helpers.cleanupDocs(
      helpers.runAdminCommand(conn, { "replSetFreeze" : secs })
    );
  };

  this.remove = function(hn) {
    var c = this.conf();
    if (!c) {
      throw new Error("no config object retrievable from local.system.replset");
    }
    c.version++;

    for (var i in c.members) {
      if (c.members[i].host === hn) {
        c.members.splice(i, 1);
        return helpers.cleanupDocs(
          helpers.runAdminCommand(conn, { "replSetReconfig": c })
        );
      }
    }

    throw new Error(util.format("Couldn\"t find %s in %j", hn, c.members));
  };

  this.status = function() {
    return helpers.cleanupDocs(
      helpers.runAdminCommand(conn, {"replSetGetStatus": 1})
    );
  };

  this.stepDown = function (secs) {
    return helpers.cleanupDocs(
      helpers.runAdminCommand(conn, { "replSetStepDown": (secs === undefined) ? 60:secs})
    );
  };

  this.syncFrom = function (host) {
    return helpers.cleanupDocs(
      helpers.runAdminCommand(conn, { "replSetSyncFrom": host })
    );
  };

  this.addArb = function(host) {
    return this.add(host, true);
  };

  this.add = function (hostport, arb) {
    var flow = this.replContext.flow;
    var cfg = hostport;
    var conf = this.conf();
    if (!conf) {
      throw Error("no config object retrievable from local.system.replset");
    }
    conf.version++;

    var max = 0;
    for (var i in conf.members)
      if (conf.members[i]._id > max) max = conf.members[i]._id;
    if (typeof hostport === "string") {
      cfg = { _id: max + 1, host: hostport };
      if (arb) {
        cfg.arbiterOnly = true;
      }
    }
    conf.members.push(cfg);
    return helpers.cleanupDocs(
      helpers.runAdminCommand(conn, { "replSetReconfig": conf})
    );
  };

  this.help = function () {
    var l = console.log;
    l("\trs.status()                     { replSetGetStatus : 1 } checks repl set status");
    l("\trs.initiate()                   { replSetInitiate : null } initiates set with default settings");
    l("\trs.initiate(cfg)                { replSetInitiate : cfg } initiates set with configuration cfg");
    l("\trs.conf()                       get the current configuration object from local.system.replset");
    l("\trs.reconfig(cfg)                updates the configuration of a running replica set with cfg (disconnects)");
    l("\trs.add(hostportstr)             add a new member to the set with default attributes (disconnects)");
    l("\trs.add(membercfgobj)            add a new member to the set with extra attributes (disconnects)");
    l("\trs.addArb(hostportstr)          add a new member which is arbiterOnly:true (disconnects)");
    l("\trs.stepDown([secs])             step down as primary (momentarily) (disconnects)");
    l("\trs.syncFrom(hostportstr)        make a secondary to sync from the given member");
    l("\trs.freeze(secs)                 make a node ineligible to become primary for the time specified");
    l("\trs.remove(hostportstr)          remove a host from the replica set (disconnects)");
    l();
    l("\trs.printReplicationInfo()       check oplog size and time range");
    l("\trs.printSlaveReplicationInfo()  check replica set members and replication lag");
    l();
    l("\treconfiguration helpers disconnect from the database so the shell will display");
    l("\tan error, even if the command succeeds.");
    l("\tsee also http://<mongod_host>:28017/_replSet for additional diagnostic info");
  };

  var _this = this;
  return Proxy.create({
    getOwnPropertyNames: function() {
      var propNames = Object.getOwnPropertyNames(_this);

      if (_this.hasOwnProperty("db")) {
        propNames.splice(propNames.indexOf("db"), 1);
      }
      if (_this.hasOwnProperty("replContext")) {
        propNames.splice(propNames.indexOf("replContext"), 1);
      }
      return propNames;
    },
    getOwnPropertyDescriptor: function(proxy, key) {
      return { "writable": false,
               "enumerable": false,
               "configurable" : true
             };
    },
    getPropertyDescriptor: function(proxy, key) {
      return this.getOwnPropertyDescriptor(proxy, key);
    },
    get: function(proxy, key) {
      return _this[key];
    }
  });
};

exports.RSHelpers = RSHelpers;
