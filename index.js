var repl = require('repl');
var mongodb = require('mongodb');
var Promise = require('mpromise');
var commander = require('commander');
var co = require('co');

var uri = 'mongodb://localhost:27017/test';

mongodb.MongoClient.connect(uri, function(error, connection) {
  var db = {};

  Object.defineProperty(db, 'test', {
    get: function() {
      var wrapper = {
        find: function(q) {
          var p = new Promise;
          //console.log('running query ' + JSON.stringify(q));
          connection.collection('test').find(q).toArray(function(error, result) {
            if (error) {
              return p.reject(error);
            }
            console.log('Got result ' + JSON.stringify(result));
            p.resolve(result);
          });

          var result;
          co(function*() {
            result = yield p;
          })();
          //console.log('Got ' + JSON.stringify(result));
          return result;
        }
      };

      return wrapper;
    }
  });

  var replServer = repl.start({
    prompt: 'nodeshell> '
  });

  replServer.context.db = db;
});
