var repl = require('repl');
var mongodb = require('mongodb');
var Emitter = require('events').EventEmitter;
var commander = require('commander');
var vm = require('vm');

var uri = 'mongodb://localhost:27017/test';

function CustomEmitter() {
  var e = new Emitter();

  this.on = function() { e.on.apply(e, arguments); };
  this.once = function() { e.once.apply(e, arguments); };
  this.emit = function() { e.emit.apply(e, arguments); };
}

mongodb.MongoClient.connect(uri, function(error, connection) {
  var db = {};

  Object.defineProperty(db, 'test', {
    get: function() {
      var wrapper = {
        find: function(q) {
          var p = new CustomEmitter();
          connection.collection('test').find(q).toArray(function(error, result) {
            if (error) {
              return p.emit('error', error);
            }
            p.emit('done', result);
          });
          return p;
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
          console.log('error: ' + error);
          console.log(cmd);
          callback();
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
