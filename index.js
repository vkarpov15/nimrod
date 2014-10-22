var repl = require('repl');
var mongodb = require('mongodb');
var Emitter = require('events').EventEmitter;
var Promise = require('mpromise');
var commander = require('commander');
var vm = require('vm');
var _ = require('underscore');
var co = require('co');

var uri = 'mongodb://localhost:27017/test';

function CustomPromise() {
  var p = new Promise();
  var _this = this;

  _.each(['then', 'on', 'fulfill', 'reject'], function(key) {
    _this[key] = function() { p[key].apply(p, arguments) };
  });
}

mongodb.MongoClient.connect(uri, function(error, connection) {
  var db = Proxy.create({
    get: function(proxy, collectionName) {
      var wrapper = {
        find: function(q) {
          var p = new CustomPromise();
          connection.collection(collectionName).find(q).toArray(function(error, result) {
            if (error) {
              return p.reject(error);
            }
            p.fulfill(result);
          });
          return p;
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
      var result = vm.runInContext(cmd, context);
      if (result instanceof CustomPromise) {
        result.on('fulfill', function(data) {
          callback(null, data);
        });
        result.on('reject', function(error) {
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
