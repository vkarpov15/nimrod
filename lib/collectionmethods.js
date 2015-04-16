var _ = require("underscore");
var helpers = require("./nimrodhelpers");
var util = require("util");
var Cursor = require("mongodb").Cursor;
var ObjectID = require("mongodb").ObjectID;
var WriteResult = require('./WriteResult');

function makeCommandObj(obj, collName) {
  if (typeof obj === "string") {
    var cmd = {};
    cmd[obj] = collName;
    obj = cmd;
  }
  return obj;
}


function BulkWriteResultWrapper(base) {
  this.__proto__ = base;

  var _this = this;
  this.toSingleResult = function() {
    var single = {"nMatched": base.nMatched,
                  "nUpserted": base.nUpserted,
                  "nModified": base.nModified,
                  "_id": base.getUpsertedIdAt(0)._id};
    var singleResult = helpers.extend(single, _this);
    singleResult.getUpsertedId = function() {
      return _this.getUpsertedIdAt(0);
    };
    return singleResult;
  };
};

function BulkOp(conn, base) {
  this.__proto__ = base;

  this.execute = function(options) {
    if (!options) {
      options = {};
    }
    base.execute(options, conn.flow.addNoError());
    return new BulkWriteResultWrapper(conn.flow.waitProper());
  };
}


function ShellIterator(conn, coll) {
  var cursor = conn.flow.waitProper();

  var nextDoc;
  var hasNextCalled = false;

  var ret = {};
  ret.countReturn = function(){
    var c = this.count();

    if (cursor.skipValue) {
      c = c - cursor.skipValue;
    }
    if (cursor.limitValue > 0 && cursor.limitValue < c) {
        return cursor.limitValue;
    }

    return Math.max(0, c);
  };

  ret.size = ret.countReturn;

  ret.arrayAccess = function (idx) {
    return ret.toArray()[idx];
  };

  ret.hasNext = function() {
    if (!hasNextCalled) {
      cursor.nextObject(conn.flow.addNoError());
      nextDoc = conn.flow.waitProper();
    }
    hasNextCalled = true;
    return !!nextDoc && !(nextDoc instanceof Error);
  };

  ret.next = function() {
    ret.hasNext();
    hasNextCalled = false;
    return nextDoc;
  };

  ret.toArray = function() {
    cursor.s.cmd.explain = false;
    var arr = [];
    if (!ret.hasNext()) {
      cursor.rewind();
      hasNextCalled = false;
    }
    while (ret.hasNext()) {
      arr.push(ret.next());
    }
    return arr;
  };

  ret.itcount = function() {
    return ret.toArray().length;
  };

  ret.length = ret.itcount;

  ret.hint = function(obj) {
    if (typeof obj === "object") {
      var index = coll.getIndexes().filter(function(index) {
        return _.isEqual(index.key, obj);
      });
      if (index.length) {
        obj = index[0].name;
      } else {
        throw new Error("bad hint index name or key");
      }
    }
    cursor.s.options.hint = obj;
    return p;
  };

  ret.explain = function(v) {
    if (cursor.cursorState.notified) {
      cursor.rewind();
      hasNextCalled = false;
    }
    cursor.s.cmd.verbosity = v;
    cursor.explain.call(cursor, conn.flow.addNoError());
    return conn.flow.waitProper();
  };

  _.each(["count"], function(fn) {
    ret[fn] = function() {
      var args = Array.prototype.slice.call(arguments, 0).concat(conn.flow.addNoError());
      cursor[fn].apply(cursor, args);
      return conn.flow.waitProper();
    };
  });

  _.each(["sort", "limit", "skip", "batchSize"], function(fn) {
    ret[fn] = function() {
      cursor[fn].apply(cursor, arguments);
      return p;
    };
  });

  ret.forEach = function(fn) {
    while (ret.hasNext()) {
      fn(ret.next());
    }
  };

  ret.map = function(fn) {
    var arr = [];
    while (ret.hasNext()) {
      arr.push(fn(ret.next()));
    }
    return arr;
  };


  var p = Proxy.create({
    get: function(target, v) {
      if (ret[v]) {
        return ret[v];
      }
      var n = parseInt(v, 10);
      if (!isNaN(n) && n >= 0) {
        return target.arrayAccess(n);
      }
      return undefined;
    }
  });

  return p;
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
  return ret;
};

var methods = function(dbLit, conn) {
  return function(collectionName) {
    return {
      initializeOrderedBulkOp: function(options) {
        if (!options) {
          options = {};
        }
        var bulk = conn.db.collection(collectionName).initializeOrderedBulkOp(options);
        return new BulkOp(conn, bulk);
      },
      initializeUnorderedBulkOp: function(options) {
        if (!options) {
          options = {};
        }
        var bulk = conn.db.collection(collectionName).initializeUnorderedBulkOp(options);
        return new BulkOp(conn, bulk);
      },
      getMongo: function() {
        return this.getDB().getMongo();
      },
      runCommand: function(cmd, params) {
        cmd = makeCommandObj(cmd, collectionName);
        var db = this.getDB();
        if (typeof cmd === "object") {
          return db.runCommand(cmd);
        }
        var c = {};
        c[cmd] = this.getName();
        if (params) {
          helpers.extend(c, params);
        }
        return db.runCommand(c);
      },
      getName: function() {
        return collectionName;
      },
      getDB: function() {
        return Proxy.create(dbLit(conn));
      },
      find: function(q, fields, limit, skip, batchSize, options) {
        checkQueryErrors(q);
        options = limit ? (options.limit = limit, options) : options;
        options = skip ? (options.skip = skip, options) : options;
        options = batchSize ? (options.batchSize = batchSize, options) : options;

        conn.db.collection(collectionName).find(q, fields, options, conn.flow.addNoError());

        return new ShellIterator(conn, this);
      },
      findOne: function(q, fields, options) {
        checkQueryErrors(q);
        conn.db.collection(collectionName).findOne(q, fields, options, conn.flow.addNoError());
        return conn.flow.waitProper();
      },
      insert: function(doc, options) {
        if (!options) {
          options = {};
        }
        conn.db.collection(collectionName).insert(doc, options, conn.flow.addNoError());
        var res = conn.flow.waitProper();
        if (res instanceof Error) {
          delete res.originalError;
          return new WriteResult(res, 'insert');
        }
        return new WriteResult(res.result, 'insert');
      },
      count: function(q) {
        checkQueryErrors(q);
        conn.db.collection(collectionName).count(q, conn.flow.addNoError());
        return conn.flow.waitProper();
      },
      remove: function(q, justOne) {
        var options = justOne ? {"single": justOne} : {};
        q = q instanceof ObjectID ? {"_id" : q } : q;
        conn.db.collection(collectionName).remove(q, options, conn.flow.addNoError());
        var ret = new WriteResult(conn.flow.waitProper().result, 'remove');
        return ret;
      },
      update: function(q, obj, upsert, multi) {
        if (typeof upsert === 'object') {
          var options = upsert;
        } else {
          var options = (upsert || multi) ?
            {"upsert": upsert, "multi": multi} : {};
        }
        conn.db.collection(collectionName).update(q, obj, options, conn.flow.addNoError());
        var res = conn.flow.waitProper();
        return new WriteResult(res.result, 'update');
      },

      // =================  others  =================
      getFullName: function() {
        return util.format("%s.%s", conn.db.databaseName, collectionName);
      },

      toString: function() {
        return this.getFullName();
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
        return conn.flow.waitProper();
      },

      ensureIndex: function(fieldOrSpec, options) {
        return this.createIndex(fieldOrSpec, options);
      },

      copyTo: function(newName) {
        var to = conn.db.collection(newName);
        to.ensureIndex({ _id: 1}, conn.flow.addNoError());
        conn.flow.waitProper();

        var count = 0;
        var cursor = this.find();
        while (cursor.hasNext()) {
          var o = cursor.next();
          count++;
          to.update({_id:o._id}, o, { upsert: true } , conn.flow.addNoError());
          conn.flow.waitProper();
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
        });
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

        try {
          helpers.runCommand(conn, { "drop": collectionName });
        } catch(e) {
          if (e.errmsg === "ns not found") {
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

      getIndexKeys: function (){
        return this.getIndexes().map(
          function(i){
            return i.key;
          }
        );
      },

      getIndexes: function() {
        var dbName = conn.db.databaseName;
        conn.db.collection("system.indexes").find({
          ns: util.format("%s.%s", dbName, collectionName)
        }, conn.flow.addNoError());
        return new ShellIterator(conn, this).toArray();
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
        var options = flow.sync(function(callback) {
          conn.db.collection(collectionName).options(callback);
        });
        return !!(options && options.capped);
      },

      mapReduce: function(map, reduce, options) {
        return flow.sync(function(callback) {
          conn.db.collection(collectionName).
            mapReduce(map, reduce, options, callback);
        });
      },

      reIndex: function() {
        return flow.sync(function(callback) {
          conn.db.collection(collectionName).reIndex(callback);
        });
      },

      renameCollection: function(newName, options) {
        return flow.sync(function(callback) {
          conn.db.collection(collectionName).rename(newName, options, callback);
        });
      },

      save: function(obj, opts) {
        var x = flow.sync(function(callback) {
          conn.db.collection(collectionName).save(obj, opts, callback);
        });
        return new WriteResult(x.result, 'save');
      },

      stats: function(opts) {
        return flow.sync(function(callback) {
          conn.db.collection(collectionName).stats(opts, callback);
        });
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

function checkQueryErrors(q) {
  if (!q) {
    return;
  }
  if (q.$and) {
    if (!Array.isArray(q.$and)) {
      throw new Error('$and must take an array!');
    }
    if (q.$and.length === 0) {
      throw new Error('$and must not be empty!');
    }
    for (var i = 0; i < q.$and.length; ++i) {
      if (typeof q.$and[i] !== 'object') {
        throw new Error('$and must be an array of objects!');
      }
      checkQueryErrors(q.$and[i]);
    }
  }
}

exports.ShellIterator = ShellIterator;
exports.Instance = methods;
exports.BulkWriteResult = BulkWriteResultWrapper;
