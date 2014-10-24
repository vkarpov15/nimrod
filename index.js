var repl = require('repl');
var mongodb = require('mongodb');
var Emitter = require('events').EventEmitter;
var Promise = require('mpromise');
var commander = require('commander');
var vm = require('vm');
var _ = require('underscore');
var co = require('co');
var asyncblock = require('asyncblock');

var uri = 'mongodb://localhost:27017/test';
var currentFlow;

function CustomPromise() {
  var p = new Promise();
  var _this = this;

  _.each(['then', 'on', 'fulfill', 'reject'], function(key) {
    _this[key] = function() { p[key].apply(p, arguments) };
  });
}

function ShellIterator(cursor) {
  this.next = function() {
    cursor.nextObject(currentFlow.add());
    return currentFlow.wait();
  };
}

mongodb.MongoClient.connect(uri, function(error, connection) {
  var db = Proxy.create({
    get: function(proxy, collectionName) {
      var wrapper = {
        find: function(q) {
          connection.collection(collectionName).find(q, currentFlow.add());
          return new ShellIterator(currentFlow.wait());
        },
        insert: function(doc) {
          var p = new CustomPromise();
          connection.collection(collectionName).insert(doc, function(error, result) {
            if (error) {
              return p.reject(error);
            }
            p.fulfill(result);
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
      asyncblock(function(flow) {
        context.flow = flow;
        currentFlow = flow;
        var result = vm.runInContext(cmd, context);
        if (result instanceof CustomPromise) {
          result.on('fulfill', function(data) {
            callback(null, data);
          });
          result.on('reject', function(error) {
            console.log('error occurred running ' + cmd);
            callback(error);
          });
        } else if (result instanceof ShellIterator) {
          var documents = [];
          for (var i = 0; i < 10; ++i) {
            documents.push(result.next());
          }
          callback(null, documents);
        } else {
          callback(null, result);
        }
      }, function(error) {
        if (error) {
          console.log('Error - ' + error);
        }
      });
    }
  });

  replServer.context.db = db;
});
