var repl = require('repl')
, mongodb = require('mongodb')
, commander = require('commander')
, vm = require('vm')
, _ = require('underscore')
, asyncblock = require('asyncblock')
, util = require('util')
, RSHelpers = require('./rshelpers.js');

var currentFlow;
var lastCursor;
var rsName;

commander.
  option('-u, --uri [uri]', 'Database URI [mongodb://localhost:27017/test]',
         'mongodb://localhost:27017/test').
  option('-f, --file [file]', 'File to run (optional)').
  parse(process.argv);

function ShellIterator(cursor) {
  var _this = this;
  this.next = function() {
    cursor.nextObject(currentFlow.add());
    return currentFlow.wait();
  };

  _.each(['sort', 'limit', 'skip'], function(fn) {
    _this[fn] = function() {
      cursor[fn].apply(cursor, arguments);
      return _this;
    };
  });
}

mongodb.MongoClient.connect(commander.uri, function(error, dbConn) {
  if (error) {
    throw error;
  }
  rsName = dbConn.serverConfig.options.rs_name;

  var db = Proxy.create({
    getOwnPropertyNames: function() {
      dbConn.collectionNames(currentFlow.add());

      return currentFlow.wait().map(function(obj) {
        var dbName = obj.name;
        return dbName.substr(dbName.indexOf(".")+1);
      });
    }
    , getOwnPropertyDescriptor: function(proxy, collectionName) {
      return { "writable": false
               , "enumerable": false
               , "configurable": true };
    }
    , getPropertyDescriptor: function(proxy, collectionName) {
      return this.getOwnPropertyDescriptor(proxy, collectionName);
    }
    , get: function(proxy, collectionName) {
      var wrapper = {
        // can't access collection names with a period (like system.indexes)
        find: function(q) {
          dbConn.collection(collectionName).find(q, currentFlow.add());
          return new ShellIterator(currentFlow.wait());
        },
        findOne: function(q) {
          dbConn.collection(collectionName).findOne(q, currentFlow.add());
          return currentFlow.wait();
        },
        insert: function(doc) {
          dbConn.collection(collectionName).insert(doc, currentFlow.add());
          return currentFlow.wait();
        },
        count: function(q) {
          dbConn.collection(collectionName).count(q, currentFlow.add());
          return currentFlow.wait();
        },
        remove: function(q) {
          dbConn.collection(collectionName).remove(q, currentFlow.add());
          return currentFlow.wait();
        }
      };

      return wrapper;
    }
  });

  if (commander.file) {
    asyncblock(function(flow) {
      this.db = db;
      this.flow = flow;
      currentFlow = flow;
      var script = require('fs').readFileSync(commander.file);
      var result =
        vm.runInThisContext(script.toString());
      console.log('Done executing script ' + commander.file + '!');
      process.exit(0);
    });
  } else {
    var replServer = repl.start({
      prompt: rsName === undefined ? 'nodeshell> ' : util.format('nodeshell:%s> ', rsName),
      eval: function(cmd, context, filename, callback) {
        asyncblock(function(flow) {
          context.flow = flow;
          currentFlow = flow;
          var result = vm.runInContext(cmd.trim(), context);
          if (result instanceof ShellIterator) {
            lastCursor = result;
            var documents = [];
            for (var i = 0; i < 10; ++i) {
              var doc = result.next();
              if (!doc) {
                break;
              }
              documents.push(doc);
            }
            console.log(JSON.stringify(documents, null, '  '));
            if (documents.length >= 10) {
              return callback(null, 'Type "it" for more');
            }
            return callback(null, 'No documents left');
          } else {
            callback(null, result);
          }
        }, function(error) {
          if (error) {
            console.log('Error - ' + error);
            callback(null);
          }
        });
      }
    });

    replServer.context.db = db;
    replServer.context.rs = new RSHelpers(replServer, dbConn);

    Object.defineProperty(replServer.context, 'it', {
      get: function() {
        return lastCursor;
      }
    });
  }
});
