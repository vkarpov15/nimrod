var helpers = require("./nimrodhelpers");

module.exports = function(db, conn) {

  return {
    host: conn.db.serverConfig.host,
    port: conn.db.serverConfig.port,

    adminCommand: db.adminCommand,
    getCollection: db.getCollection,
    getDB: function(name) {
      return db.getSiblingDB(name);
    },
    getDBs: function() {
      var res = helpers.runCommand({"listDatabases" : 1});
      if (!res.ok) {
        throw new Error("listDatabases failed: %s", res);
      }
      return res;
    },
    getDBNames: function() {
      return this.getDBs().databases.map(function(z) {
        return z.name;
      });
    },
    setLogLevel: function(logLevel) {
      return db.adminCommand({ "setParameter": 1, "logLevel": logLevel });
    },
    useWriteCommands: function() {
      return true;
    },
    writeMode: function() {
      return "commands";
    }
  };
};
