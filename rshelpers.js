var util = require('util');

function cleanupDocs(res) {
  // TODO: need a better solution for this
  if (!res) {
    return null;
  }
  if ('cursorId' in res && ('documents' in res || 'items' in res)) {
    res = res.documents || res.items;
  }
  if (res instanceof Array && res.length == 1) {
    res = res[0];        
  }
  return res;
}

function RSHelpers(repl, conn) {
  this.db = conn.db;
  this.replContext = repl.context;  

  this.initiate = function(conf) {
    var flow = this.replContext.flow;
    this.db.admin().command({ replSetInitiate: conf }, flow.add());
    return cleanupDocs(flow.wait());
  };

  this.conf = function () {
    var flow = this.replContext.flow;
    this.db.db("local")
      .collection("system.replset").findOne({}, flow.add());
    return cleanupDocs(flow.wait());
  };

  this.reconfig = function(cfg, options) {
    var flow = this.replContext.flow;
    cfg.version = this.conf().version + 1;
    var cmd = { "replSetReconfig": cfg };
    for (var i in options) {
      cmd[i] = options[i];
    }
    this.db.admin().command(cmd, flow.add());
    return cleanupDocs(flow.wait());
  };

  this.freeze = function (secs) {
    var flow = this.replContext.flow;
    this.db.admin().command({"replSetFreeze":secs}, flow.add());
    return cleanupDocs(flow.wait());
  };

  this.remove = function(hn) {
    var flow = this.replContext.flow;
    var c = this.conf();
    if (!c) {
      throw new Error("no config object retrievable from local.system.replset");
    }
    c.version++;
    
    for (var i in c.members) {
      if (c.members[i].host == hn) {
        c.members.splice(i, 1);
        this.db.admin().command({"replSetReconfig" : c}, flow.add());
        return cleanupDocs(flow.wait());
      }
    }
    
    throw new Error(util.format("Couldn't find %s in %j", hn, c.members));
  };

  this.status = function() {
    var flow = this.replContext.flow;
    this.db.admin().command({ "replSetGetStatus": 1 }, flow.add());
    return cleanupDocs(flow.wait());
  };

  this.stepDown = function (secs) { 
    var flow = this.replContext.flow;
    this.db.admin().command({ "replSetStepDown":
                              (secs === undefined) ? 60:secs},
                            flow.add());
    return cleanupDocs(flow.wait());
  };

  this.syncFrom = function (host) { 
    var flow = this.replContext.flow;
    this.db.admin().command({"replSetSyncFrom" : host}, flow.add());
    return cleanupDocs(flow.wait());
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
    if (typeof hostport == "string") {
      cfg = { _id: max + 1, host: hostport };
      if (arb) {
        cfg.arbiterOnly = true;
      }
    }
    conf.members.push(cfg);
    this.db.admin().command({ replSetReconfig: conf }, flow.add());
    return cleanupDocs(flow.wait());
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
               "configurable": true };
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
exports.cleanupDocs = cleanupDocs;
