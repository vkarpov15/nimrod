var helpers = require("./nimrodhelpers");
var mongodb = require('mongodb');
var util = require("util");
var ShellIterator = require("./collectionmethods").ShellIterator;
var MongoShellObj = require("./mongoshellobj");
var crypto = require("crypto");


function makeCommandObj(obj) {
  if (typeof obj === "string") {
    var cmd = {};
    cmd[obj] = 1;
    obj = cmd;
  }
  return obj;
}


function hex_md5(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function hashPassword(user, pass) {
  if (typeof pass !== "string") {
    throw new Error("User passwords must be of type string. Received type '%s'", typeof pass);
  }
  return hex_md5(user + ":mongo:" + pass);
}

function pwHash(nonce, user, pass) {
  return hex_md5(nonce + user + hashPassword(user, pass));
}


module.exports = function(dbLit, conn) {
  var _defaultWriteConcern = { "w": "majority", "wtimeout": 30 * 1000 };

  var methods = {
    _dbCommand: function(cmd) {
      cmd = makeCommandObj(cmd);
      var res = helpers.cleanupDocs(helpers.runCommand(conn, cmd));
      return res;
    },

    stats: function(scale) {
      return this.runCommand({ "dbstats" : 1, "scale" : scale });
    },

    createCollection: function(collName, options) {
      conn.db.createCollection(collName, options, conn.flow.addNoError());
      var result = conn.flow.waitProper();
      if (result instanceof Error) {
        return result;
      }
      return { ok: 1 };
    },

    hostInfo: function() {
      return this.adminCommand("hostInfo");
    },

    currentOp: function(arg) {
      var q = {};
      if (arg) {
        if (typeof arg === "object") {
          helpers.extend(q, arg);
        } else if (arg) {
          q["$all"] = true;
        }
      }
      return this.getCollection("$cmd.sys.inprog").findOne(q);
    },

    dropDatabase: function() {
      if (arguments.length) {
        throw new Error("dropDatabase doesn't take arguments");
      }
      return this.runCommand({"dropDatabase": 1});
    },

    copyDatabase: function(from, to, fromHost, user, pass) {
      fromHost = fromHost || "";
      if (user && pass) {
        var n = this.adminCommand({"copydbgetnonce": 1, "fromhost": fromHost});
        return this.adminCommand({"copydb": 1, "fromhost": fromHost,
                                  "fromdb": from, "todb": to,
                                  "username": user, "nonce": n.nonce,
                                  "key": pwHash(n.nonce, user, pass)});
      }
      return this.adminCommand({"copydb": 1,
                                "fromhost": fromHost, "fromdb": from, "todb": to});
    },

    eval: function(fn) {
      var cmd = { $eval: fn.toString() };
      if (arguments.length > 1) {
        cmd.args = Array.prototype.slice.call(arguments, 1);
      }

      var res = this._dbCommand(cmd);
      if (!res.ok) {
        throw Error(require('util').inspect(res));
      }

      return res.retval;
    },

    getName: function() {
      return conn.db.databaseName;
    },

    getMongo: function() {
      return MongoShellObj(this, conn);
    },

    group: function(params) {
      var o = {};
      for (var key in params) {
        if (key === 'reduce') {
          o.$reduce = new mongodb.Code(params.reduce);
        } else if (key === 'keyf') {
          o.$keyf = params.keyf;
        } else {
          o[key] = params[key];
        }
      }
      var res = this.runCommand({ group: o });
      console.log(require('util').inspect(res));
      return res.retval;
    },

    adminCommand: function(cmd) {
      cmd = makeCommandObj(cmd);
      return helpers.cleanupDocs(helpers.runAdminCommand(conn, cmd));
    },

    getSiblingDB: function(dbName) {
      var newConn = {};
      newConn.db = conn.db.db(dbName);
      newConn.flow = conn.flow;
      return Proxy.create(dbLit(newConn));
    },

    getSisterDB: function(dbName) {
      return this.getSiblingDB(dbName);
    },

    getCollection: function(collName) {
      return Proxy.create(dbLit(conn))[collName];
    },

    getCollectionNames: function() {
      conn.db.listCollections().toArray(conn.flow.addNoError());
      return conn.flow.waitProper();
    },

    getCollectionInfos: function() {
      conn.db.listCollections().toArray(conn.flow.addNoError());
      return conn.flow.waitProper();
    },

    getProfilingLevel: function() {
      return this.runCommand({ profile: -1 });
    },

    getRoles: function(args) {
      var cmdObj = {"rolesInfo":1};
      helpers.extend(cmdObj, args);
      var res = this.runCommand(cmdObj);
      if (!res.ok) {
        throw new Error(res.errmsg);
      }
      return res.roles;
    },

    getUsers: function(args) {
      var cmdObj = {"usersInfo": 1};
      helpers.extend(cmdObj, args);
      var res = this.runCommand(cmdObj);
      if (!res.ok) {
        var authSchemaIncompatibleCode = 69;
        if (res.code == authSchemaIncompatibleCode ||
            (res.code == null && res.errmsg == "no such cmd: usersInfo")) {
          // Working with 2.4 schema user data
          conn.db.collection("system.users").find({}, conn.flow.addNoError());
          return new ShellIterator(conn).toArray();
        }

        throw new Error(res.errmsg);
      }

      return res.users;
    },

    createUser: function(obj, wc) {
      if (typeof obj !== "object") {
        throw new Error("parameters to 'db.createUser' should be sent in object literal");
      }
      if (!("user" in obj)) {
        throw new Error("You must specify a 'user'");
      }
      var name = obj["user"];
      var cmdObj = {"createUser" : name};
      helpers.extend(cmdObj, obj);
      delete cmdObj["user"];

      cmdObj["writeConcern"] = wc ? wc : _defaultWriteConcern;
      var res = this.runCommand(cmdObj);
      if (res.ok) {
        delete obj.pwd;
        return util.format("successfully added user: %j", obj);
      }
      if (res.errmsg.indexOf("no such cmd") !== -1) {
        throw new Error("'createUser' command not found." +
                        "Use MongoDB server 2.6 and above");
      } else if (res.errmsg === "timeout") {
        throw new Error("timed out while waiting for user authentication");
      }
      throw new Error(util.format("couldn't add user: %s", res.errmsg));
    },

    auth: function() {
      if (arguments.length == 1) {
        if (typeof arguments[0] != "object") {
          throw new Error("Single-argument form of auth expects a parameter object");
        }
        var obj = arguments[0];
        var user = obj.user;
        var pwd = obj.pwd;
        delete options.user;
        delete options.pwd;

        conn.db.authenticate(user, pwd, options, conn.flow.addNoError());
      } else if (arguments.length == 2) {
        conn.db.authenticate(arguments[0], arguments[1], conn.flow.addNoError());
      } else {
        throw new Error("auth expects either (username, password) or ({ user: username, pwd: password })");
      }

      var res = conn.flow.waitProper();
      if (res instanceof Error && res.name == 'MongoError') {
        return 0;
      }
      return 1;
    },

    logout: function(options) {
      if (options) {
        conn.db.logout(options, conn.flow.addNoError());
      } else {
        conn.db.logout(conn.flow.addNoError());
      }
      if (conn.flow.waitProper()) {
        return {"ok": 1};
      }
      return {"ok": 0};
    },

    removeUser: function(user, options) {
      if (options) {
        conn.db.removeUser(user, options, conn.flow.addNoError());
      } else {
        conn.db.removeUser(user, conn.flow.addNoError());
      }
      return conn.flow.waitProper();
    },

    serverStatus: function() {
      return methods.runCommand({ serverStatus: 1 });
    },

    changeUserPassword: function(user, pass, wc) {
      var users = this.getUsers();
      var userObj;
      for (var k in users) {
        if (users[k].user == user) {
          userObj = users[k];
          break;
        }
      }
      if (!userObj) {
        throw new Error(util.format("User '%s' not found", user));
      }
      delete userObj._id;
      delete userObj.db;

      if (!this.dropUser(user, wc)) {
        return false;
      }
      userObj.pwd = pass;
      if (this.createUser(userObj, wc)) {
        return true;
      }
      return false;
    },

    dropAllUsers: function(wc) {
      var res = this.runCommand({"dropAllUsersFromDatabase": 1,
                                 "writeConcern": wc ? wc : _defaultWriteConcern});

      if (!res.ok) {
        throw new Error(res.errmsg);
      }
      return res.n;
    },

    dropUser: function(user, wc) {
      var cmdObj = {"dropUser": user,
                    "writeConcern": wc ? wc : _defaultWriteConcern};
      var res = this.runCommand(cmdObj);
      if (res.ok) {
        return true;
      }

      if (res.code == 11) { // Code 11 = UserNotFound
        return false;
      }

      throw new Error(res.errmsg);
    },

    setProfilingLevel: function(level, slowms) {
      var cmd = { profile: level };
      if (typeof slowms === 'number') {
        cmd.slowms = slowms;
      }
      return this.runCommand(cmd);
    }
  };

  // Aliases
  methods.runCommand = methods._dbCommand;

  return methods;
};
