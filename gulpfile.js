var gulp = require('gulp');
var clean = require('gulp-clean');
var fs = require('fs');
var request = require('request');

var KIMONO_API = 'https://www.kimonolabs.com/api/cdg4vllw?apikey=qCPpivTPkfSKk3EgoT8f0SGIZwl8rjwF';

gulp.task('clean', function() {
  return gulp.src('jstests', { read: false }).pipe(clean());
});

gulp.task('jstests', ['clean'], function() {
  request.get(KIMONO_API, function(error, response, body) {
    if (error) {
      throw error;
    }

    fs.mkdirSync('./jstests');

    var body = JSON.parse(body);
    var allTests = body.results.collection1;

    for (var i = 0; i < allTests.length; ++i) {
      var test = allTests[i];
      console.log('Downloading ' + test.testName.text);
      request.get(test.testName.href).pipe(fs.createWriteStream('./jstests/' + test.testName.text));
    }
  });
});
