var helpers = require("./nimrodhelpers");
var util = require("util");
var ShellIterator = require("./collectionmethods").ShellIterator;

module.exports = function(dbLit, conn)  {
  var _defaultWriteConcern = {"w": "majority", "wtimeout": 30 * 1000 };

  return {

    getSiblingDB: function(dbName) {
      var newConn = {};
      newConn.db = conn.db.db(dbName);
      newConn.flow = conn.flow;
      return Proxy.create(dbLit(newConn));
    },

    getSisterDB: function(dbName) {
      return this.getSiblingDB(dbName);
    },

    getRoles: function(args) {
      var cmdObj = {"rolesInfo":1};
      helpers.extend(cmdObj, args);
      var res = helpers.cleanupDocs(helpers.runCommand(conn, cmdObj));
      if (!res.ok) {
        throw new Error(res.errmsg);
      }
      return res.roles;
    },

    getUsers: function(args) {
      var cmdObj = {"usersInfo": 1};
      helpers.extend(cmdObj, args);
      var res = helpers.cleanupDocs(helpers.runCommand(conn, cmdObj));
      if (!res.ok) {
        var authSchemaIncompatibleCode = 69;
        if (res.code == authSchemaIncompatibleCode ||
            (res.code == null && res.errmsg == "no such cmd: usersInfo")) {
          // Working with 2.4 schema user data
          conn.db.collection("system.users").find({}, conn.flow.add());
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
      var res = helpers.cleanupDocs(helpers.runCommand(conn, cmdObj));
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

        conn.db.authenticate(user, pwd, options, conn.flow.add());
      } else if (arguments.length == 2) {
        conn.db.authenticate(arguments[0], arguments[1], conn.flow.add());
      } else {
        throw new Error("auth expects either (username, password) or ({ user: username, pwd: password })");
      }

      return conn.flow.wait();
    },

    logout: function(options) {
      if (options) {
        conn.db.logout(options, conn.flow.add());
      } else {
        conn.db.logout(conn.flow.add());
      }
      return conn.flow.wait();
    },

    removeUser: function(user, options) {
      if (options) {
        conn.db.removeUser(user, options, conn.flow.add());
      } else {
        conn.db.removeUser(user, conn.flow.add());
      }
      return conn.flow.wait();
    },

    dropUser: function(user, wc) {
      var cmdObj = {"dropUser": user,
                    "writeConcern": wc ? wc : _defaultWriteConcern};
      var res = helpers.cleanupDocs(helpers.runCommand(conn, cmdObj));

      if (res.ok) {
        return true;
      }

      if (res.code == 11) { // Code 11 = UserNotFound
        return false;
      }

      throw new Error(res.errmsg);
    }
  };
};

