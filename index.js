var repl = require('repl');
var mongodb = require('mongodb');
var commander = require('commander');
var vm = require('vm');
var _ = require('underscore');
var asyncblock = require('asyncblock');

var uri = 'mongodb://localhost:27017/test';
var currentFlow;
var lastCursor;

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

mongodb.MongoClient.connect(uri, function(error, connection) {
  var db = Proxy.create({
    get: function(proxy, collectionName) {
      var wrapper = {
        find: function(q) {
          connection.collection(collectionName).find(q, currentFlow.add());
          return new ShellIterator(currentFlow.wait());
        },
        insert: function(doc) {
          connection.collection(collectionName).insert(doc, currentFlow.add());
          return currentFlow.wait();
        },
        findOne: function(q) {
          connection.collection(collectionName).findOne(q, currentFlow.add());
          return currentFlow.wait();
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
          callback(null, 'Type "it" for more');
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
  Object.defineProperty(replServer.context, 'it', {
    get: function() {
      return lastCursor;
    }
  });
});
