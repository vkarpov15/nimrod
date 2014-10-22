var repl = require('repl');
var mongodb = require('mongodb');
var bluebird = require('bluebird');
var commander = require('commander');

var uri = 'mongodb://localhost:27017';

mongodb.MongoClient.connect(uri, function(error, db) {
  repl.start({
    prompt: 'nodeshell> '
  });
});
