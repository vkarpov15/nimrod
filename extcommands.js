var rs = require('./rshelpers.js');

function Ext(conn) {
  this.connObj = conn;

  this.regexes = {
    use: /use (\w+)/,
    show: /show (\w+)/
  };
}

Ext.prototype.execute = function(cmd, flow) {
  var arg;
  // 'use' shell helper
  arg = oneArg(this.regexes.use, cmd);
  if (arg != null) {
    this.connObj.db = this.connObj.db.db(arg);
    return true;
  }

  // 'show' shell helper
  arg = oneArg(this.regexes.show, cmd);
  switch(arg) {
  case 'profile':
    break;

  case 'users':
    this.connObj.db.db("admin")
      .collection("system.users").find({}, flow.add());
    var results = rs.cleanupDocs(flow.wait());
    results.forEach(function(user) {
      console.log(user);
    });
    break;
  case 'roles':
    this.connObj.db.db("admin")
      .collection("system.roles").find({}, flow.add());
    var results = rs.cleanupDocs(flow.wait());
    results.forEach(function(user) {
      console.log(user);
    });
    break;

  case 'log':
    break;
  case 'logs':
    break;

  case 'startupWarnings':
    break;

  case 'databases':
  case 'dbs':
    this.connObj.db.admin().command({'listDatabases':1}, flow.add());
    var dbs = rs.cleanupDocs(flow.wait());
    var dbInfo = [];
    var maxNameLength = 0;
    var maxGbDigits = 0;

    // modified from 
    // https://github.com/mongodb/mongo/blob/master/src/mongo/shell/utils.js#L626
    dbs.databases.forEach(function (x){
      var sizeStr = (x.sizeOnDisk / (1024 * 1024 * 1024)).toFixed(3);
      var nameLength = x.name.length;
      var gbDigits = sizeStr.indexOf(".");

      if (nameLength > maxNameLength) {
        maxNameLength = nameLength;
      }
      if (gbDigits > maxGbDigits) {
        maxGbDigits = gbDigits;
      }
      
      dbInfo.push({
        name:      x.name,
        size:      x.sizeOnDisk,
        sizeStr:  sizeStr,
        nameSize: nameLength,
        gbDigits: gbDigits
      });
    });

    dbInfo.sort(function(l, r) { 
      return (l == r ? 0 : ( l < r ? -1 : 1));
    });

    dbInfo.forEach(function (db) {
      var namePadding = maxNameLength - db.nameSize;
      var sizePadding = maxGbDigits   - db.gbDigits;
      var padding = Array(namePadding + sizePadding + 3).join(" ");
      if (db.size > 1) {
       console.log(db.name + padding + db.sizeStr + "GB");
      } else {
        console.log(db.name + padding + "(empty)");
      }
    });
    break;

  case 'tables':
  case 'collections':
    this.connObj.db.collectionNames(flow.add());
    flow.wait().forEach(function(obj) {
      var collName = obj.name;
      console.log(collName.substr(collName.indexOf(".")+1));
    });
    break;

  default: return false
  }

  return !!arg;
};

var oneArg = function(reg, cmd) {
  var matches = cmd.match(reg);
  if (matches && matches.length == 2 && matches[1].length > 0) {
    return matches[1];
  }
  return null;
};

module.exports = Ext;
