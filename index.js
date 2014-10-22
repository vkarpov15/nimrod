var repl = require('repl');
var mongodb = require('mongodb');
var bluebird = require('bluebird');
var commander = require('commander');

commander.
  option('-u, --uri', 'MongoDB URI').
  parse(process.argv);

mongodb.MongoClient.connect(commander.uri, function(error, db) {
  repl.start({
    prompt: 'nodeshell> '
  });
});
