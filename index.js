var repl = require('repl');
var mongodb = require('mongodb');
var Emitter = require('events').EventEmitter;
var commander = require('commander');
var co = require('co');
var vm = require('vm');

var uri = 'mongodb://localhost:27017/test';

function CustomEmitter() {
  var e = new Emitter();

  this.on = function() { e.on.apply(e, arguments); };
  this.once = function() { e.once.apply(e, arguments); };
  this.emit = function() { e.emit.apply(e, arguments); };
}

mongodb.MongoClient.connect(uri, function(error, connection) {
  var db = Proxy.create({
    get: function(proxy, collectionName) {
      var wrapper = {
        find: function(q) {
          var p = new CustomEmitter();
          connection.collection(collectionName).find(q).toArray(function(error, result) {
            if (error) {
              return p.emit('error', error);
            }
            p.emit('done', result);
          });
          return p;
        },
        insert: function(doc) {
          var p = new CustomEmitter();
          connection.collection(collectionName).insert(doc, function(error, result) {
            if (error) {
              return p.emit('error', error);
            }
            p.emit('done', result);
          });
        }
      };

      return wrapper;
    }
  });

  var replServer = repl.start({
    prompt: 'nodeshell> ',
    eval: function(cmd, context, filename, callback) {
      var result = vm.runInContext(cmd, context);
      if (result instanceof CustomEmitter) {
        result.on('done', function(data) {
          callback(null, data);
        });
        result.on('error', function(error) {
          console.log('error occurred running ' + cmd);
          callback(error);
        });
      } else {
        process.nextTick(function() {
          callback(null, result);
        });
      }
    }
  });

  replServer.context.db = db;
});
