var _ = require("underscore");
var helpers = require("./nimrodhelpers");
var util = require("util");
var Cursor = require('mongodb').Cursor;

function ShellIterator(conn) {
  var cursor = conn.flow.wait();
  var _this = this;

  var nextDoc;
  var hasNextCalled = false;

  this.hasNext = function() {
    if (!hasNextCalled) {
      cursor.nextObject(conn.flow.addNoError());
      nextDoc = conn.flow.wait();
    }
    hasNextCalled = true;
    return !!nextDoc;
  };

  this.next = function() {
    this.hasNext();
    hasNextCalled = false;
    return nextDoc;
  };

  this.toArray = function() {
    var ret = [];
    while (this.hasNext()) {
      ret.push(this.next());
    };
    return ret;
  };

  this.itcount = function() {
    return this.toArray().length;
  };

  this.length = this.itcount;

  this.hint = function(obj) {
    cursor =  new Cursor(cursor.db, cursor.collection,
                         cursor.selector, cursor.fields,
                         {hint: obj});
    return _this;
  };

  _.each(["count", "explain"], function(fn) {
    _this[fn] = function() {
      cursor[fn].call(cursor, conn.flow.addNoError());
      return conn.flow.wait();
    };
  });

  _.each(["sort", "limit", "skip"], function(fn) {
    _this[fn] = function() {
      cursor[fn].apply(cursor, arguments);
      return _this;
    };
  });
}

function genIndexName(keys) {
  var name = "";
  for (var k in keys) {
    var v = keys[k];
    if (typeof v === "function")
      continue;

    if ( name.length > 0 )
      name += "_";
    name += k + "_" + v;
  }

  return name;
}

function indexSpec(fullCollName, keys, options) {
  var ret = { ns : fullCollName, key : keys , name : genIndexName(keys) };

  if (!options) {
    return ret;
  }

  if (typeof options === "string") {
    ret.name = options;
  } else if (typeof options === "boolean") {
    ret.unique = true;
  } else if (typeof options === "object" ) {
    if (options.length) {
      var nb = 0;
      for (var i = 0; i < options.length; i++) {
        if (typeof options[i] === "string") {
          ret.name = options[i];
        } else if (typeof options[i] === "boolean") {
          if (options[i]) {
            if (nb === 0) {
              ret.unique = true;
            } else if (nb === 1) {
              ret.dropDups = true;
            }
          }
          nb++;
        }
      }
    }
    else {
      helpers.extend(ret , options);
    }
  }
  else {
    throw new Error(util.format("can't handle: %j", typeof options));
  }
};

var methods = function(conn) {
  return function(collectionName) {
    return {
      find: function(q, fields, limit, skip, batchSize, options) {
        options = limit ? (options.limit = limit, options) : options;
        options = skip ? (options.skip = skip, options) : options;
        options = batchSize ? (options.batchSize = batchSize, options) : options;

        conn.db.collection(collectionName).find(q, fields, options, conn.flow.addNoError());
        return new ShellIterator(conn);
      },
      findOne: function(q, fields, options) {
        conn.db.collection(collectionName).findOne(q, fields, options, conn.flow.addNoError());
        return conn.flow.wait();
      },
      insert: function(doc, options) {
        if (!options) {
          options = {};
        }
        conn.db.collection(collectionName).insert(doc, options, conn.flow.addNoError());
        return conn.flow.wait();
      },
      count: function(q) {
        conn.db.collection(collectionName).count(q, conn.flow.addNoError());
        return conn.flow.wait();
      },
      remove: function(q, justOne) {
        var options = justOne ? {"single": justOne} : {};
        conn.db.collection(collectionName).remove(q, options, conn.flow.addNoError());
        return conn.flow.wait();
      },
      update: function(q, obj, upsert, multi) {
        var options = (upsert || multi) ?
          {"upsert": upsert, "multi": multi} : {};
        conn.db.collection(collectionName).update(q, obj, options, conn.flow.addNoError());
        return conn.flow.wait();
      },

      // =================  others  =================
      getFullName: function() {
        return util.format("%s.%s", conn.db.databaseName, collectionName);
      },

      clean: function() {
        return helpers.runCommand(conn, {"clean": collectionName});
      },

      validate: function(full) {
        var cmd = {"validate" : collectionName};
        if (typeof full === "object" ) {
          helpers.extend(cmd, full);
        } else {
          cmd.full = full;
        }
        return helpers.runCommand(conn, cmd);
      },

      aggregate: function(pipeline, opts) {
        opts = opts === undefined ? {} : opts;
        if ("cursor" in opts) {
          var cursor = conn.db.collection(collectionName).aggregate(pipeline, opts);
          return new helpers.AggregationCursor(conn, cursor);
        }
        conn.db.collection(collectionName).aggregate(
          pipeline, opts, conn.flow.addNoError()
        );
        return conn.flow.wait();
      },

      ensureIndex: function(fieldOrSpec, options) {
        if (!options) {
          options = {};
        }
        conn.db.collection(collectionName).ensureIndex(
          fieldOrSpec, options, conn.flow.addNoError()
        );
        return conn.flow.wait();
      },

      copyTo: function(newName) {
        var to = conn.db.collection(newName);
        to.ensureIndex({ _id: 1}, conn.flow.addNoError());
        conn.flow.wait();

        var count = 0;
        var cursor = this.find();
        while (cursor.hasNext()) {
          var o = cursor.next();
          count++;
          to.update({_id:o._id}, o, { upsert: true } , conn.flow.addNoError());
          conn.flow.wait();
        }

        return count;
      },

      createIndex: function(keys, options) {
        if (!keys) {
          throw new Error("you must specify the index keys");
        }
        var o = indexSpec(this.getFullName(), keys, options);
        return helpers.runCommand(conn, { "createIndexes": collectionName, indexes: [o] });
      },

      dataSize: function() {
        return this.stats().size;
      },

      distinct: function(keyString, query) {
        keyStringType = typeof keyString;
        if (keyStringType !== "string") {
          throw new Error(
            util.format("The first argument to the distinct command must be a string but was a %j", keyStringType)
          );;
        }
        queryType = typeof query;
        if (!!query && queryType !== "object") {
          throw new Error(
            util.format("The query argument to the distinct command must be a document but was a %j", queryType)
          );
        }
        var res = helpers.runCommand(conn, {
          "distinct" : collectionName,
          key: keyString,
          query: query || {}
        })
        if (!res.ok) {
          throw new Error(
            util.format("distinct failed: %j", res )
          );
        }
        return res.values;
      },

      drop: function() {
        if (arguments.length) {
          throw new Error("drop takes no argument");
        }
        if (!helpers.collectionExists(conn, collectionName)) {
          return false;
        }
        var ret = helpers.runCommand(conn, { "drop": collectionName });
        if (!ret.ok) {
          if (ret.errmsg === "ns not found") {
            return false;
          }
          throw new Error(util.format("drop failed: %j", ret));
        }
        return true;
      },

      dropIndex: function (index) {
        return helpers.runCommand(conn, {"deleteIndexes" : collectionName, "index": index});
      },

      dropIndexes: function() {
        if (arguments.length) {
          throw new Error("dropIndexes doesn't take arguments");
        }
        if (!helpers.collectionExists(conn, collectionName)) {
          return false;
        }
        var res = helpers.runCommand(conn, { "deleteIndexes" : collectionName, index: "*" });
        if (res.ok) {
          return res;
        }
        if (res.errmsg && res.errmsg.match(/not found/)) {
          return res;
        }
        throw new Error(util.format("error dropping indexes: %j", ret));
      },

      findAndModify: function(args) {
        var cmd = { "findandmodify": collectionName };
        for (var key in args) {
          cmd[key] = args[key];
        }

        var ret = helpers.runCommand(conn, cmd);
        if (!ret.ok) {
          if (ret.errmsg === "No matching object found") {
            return null;
          }
          throw new Error(util.format("findAndModify failed: %j", ret));
        }
      },

      getIndexes: function() {
        var dbName = conn.db.databaseName;
        conn.db.collection("system.indexes").find({
          ns: util.format("%s.%s", dbName, collectionName)
        }, conn.flow.addNoError());
        return new ShellIterator(conn).toArray();
      },

      indexStats: function(params) {
        var cmd = { "indexStats": collectionName};
        if (typeof params === "object") {
          helpers.extend(cmd, params)
        }
        var res;
        try {
          res = helpers.runCommand(conn, cmd);
        } catch (ex) {
          if (!res || (!res.ok && res.errmsg.match(/no such cmd/))) {
            console.log("this comand requires starting mongod with --enableExperimentalIindexStats");
          }
        }
        return res;
      },

      isCapped: function() {
        conn.db.collection(collectionName).options(conn.flow.addNoError());
        var options = conn.flow.wait();
        return !!(options && options.capped);
      },

      mapReduce: function(map, reduce, options) {
        conn.db.collection(collectionName).mapReduce(map, reduce, options, conn.flow.addNoError());
        return conn.flow.wait();
      },

      reIndex: function() {
        conn.db.collection(collectionName).reIndex(conn.flow.addNoError());
        return conn.flow.wait();
      },

      renameCollection: function(newName, options) {
        conn.db.collection(collectionName).rename(newName, options, conn.flow.addNoError());
        return conn.flow.wait();
      },

      save: function(obj, opts) {
        conn.db.collection(collectionName).save(obj, opts, conn.flow.addNoError());
        return conn.flow.wait();
      },

      stats: function(opts) {
        conn.db.collection(collectionName).stats(opts, conn.flow.addNoError());
        return conn.flow.wait();
      },

      storageSize: function() {
        return this.stats().size;
      },

      totalIndexSize: function(verbose) {
        var stats = this.stats();
        if (verbose) {
          for (var ns in stats.indexSizes) {
            console.log(util.format("%s\t%s", ns, stats.indexSizes[ns]));
          }
        }
        return stats.totalIndexSize;
      },

      totalSize: function() {
        return this.totalIndexSize() + this.storageSize();
      }

    }
  };
};

exports.ShellIterator = ShellIterator;
exports.Instance = methods;

