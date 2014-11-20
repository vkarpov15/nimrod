var repl = require('repl');
var mongodb = require('mongodb');
var commander = require('commander');
var vm = require('vm');
var _ = require('underscore');
var asyncblock = require('asyncblock');
var util = require('util');
var rs = require('./lib/rshelpers.js');
var Ext = require('./lib/extcommands.js');
var CollMethods = require('./lib/collectionmethods.js');
var ShellIterator = CollMethods.ShellIterator;

var lastCursor;
var rsName;
var ext;
// store 'flow' and 'db'
var _conn = {};

commander.
  option('-u, --uri [uri]', 'Database URI [mongodb://localhost:27017/test]',
         'mongodb://localhost:27017/test').
  option('-f, --file [file]', 'File to run (optional)').
  parse(process.argv);

mongodb.MongoClient.connect(commander.uri, function(error, dbConn) {
  if (error) {
    throw error;
  }
  _conn.db = dbConn;
  coll = CollMethods.Instance(_conn);
  ext = Ext(_conn);
  rsName = _conn.db.serverConfig.options.rs_name;

  var db = Proxy.create({
    getOwnPropertyNames: function() {
      _conn.db.collectionNames(_conn.flow.add());

      return _conn.flow.wait().map(function(obj) {
        var collName = obj.name;
        return collName.substr(collName.indexOf('.')+1);
      });
    },
    getOwnPropertyDescriptor: function(proxy, collectionName) {
      return { 'writable': false,
               'enumerable': false,
               'configurable': true
             };
    },
    getPropertyDescriptor: function(proxy, collectionName) {
      return this.getOwnPropertyDescriptor(proxy, collectionName);
    },
    get: function(proxy, collectionName) {
      var collOps = coll(collectionName);
      var collOpKeys = Object.keys(collOps);

      var _this = this;
      return Proxy.create({
        getOwnPropertyNames: function() {
          var collNames = _this.getOwnPropertyNames();
          var matchColls = collNames.filter(function(collName) {
            return collName != collectionName &&
              collName.indexOf(collectionName) != -1;
          }).map(function(collName) {
            return collName.substr(collName.indexOf('.')+1);
          });
          if (matchColls.length) {
            return matchColls.sort();
          }
          return collOpKeys.sort();
        },
        getOwnPropertyDescriptor: function(proxy, op) {
          return _this.getOwnPropertyDescriptor(proxy, op);
        },
        getPropertyDescriptor: function(proxy, op) {
          return _this.getPropertyDescriptor(proxy, op);
        },
        get: function(proxy, op) {
          if (collOpKeys.indexOf(op) != -1) {
            return collOps[op];
          }
          return _this.get(proxy, collectionName+'.'+op);
        }
      });
    }
  });

  if (commander.file) {
    asyncblock(function(flow) {
      this.db = db;
      this.flow = flow;
      conn.flow = flow;
      var script = require('fs').readFileSync(commander.file);
      var result =
        vm.runInThisContext(script.toString());
      console.log('Done executing script ' + commander.file + '!');
      process.exit(0);
    });
  } else {
    var replServer = repl.start({
      prompt: rsName === undefined ?
        'nodeshell> ' :
        util.format('nodeshell:%s> ', rsName),
      ignoreUndefined: true,
      eval: function(cmd, context, filename, callback) {
        asyncblock(function(flow) {
          context.flow = flow;
          _conn.flow = flow;

          var cmdToRun = cmd.trim();
          var result;
          if (!ext.execute(cmdToRun)) {
            result = vm.runInContext(cmdToRun, context);
          }

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
          } if (result instanceof Function) {
            console.log(result.toString());
            return callback(null, undefined);
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
    replServer.context.rs = new rs.RSHelpers(_conn);

    Object.defineProperty(replServer.context, 'it', {
      get: function() {
        return lastCursor;
      }
    });
  }
});
