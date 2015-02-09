var childProcess = require('child_process');
var fs = require('fs');

var jstests = fs.readdirSync('./jstests/');

var success = 0;
jstests.forEach(function(file) {
  console.log('\n\n------');
  console.log('Executing: ' + file);

  try {
    childProcess.execSync('node --harmony --harmony_proxies index.js --file ./jstests/' + file);
    ++success;
  } catch(e) {
    console.log('Test failed: ' + e);
  }
});

console.log('Passed: ' + success + '/' + jstests.length);
