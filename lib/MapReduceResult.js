module.exports = MapReduceResult;

function MapReduceResult(collection, results) {
  this.collection = collection;
  this.results = results;
}

MapReduceResult.prototype.convertToSingleObject = function() {
  var z = {};
  var it = this.results;
  it.forEach(function(a){ z[a._id] = a.value; });
  return z;
};

MapReduceResult.prototype.drop = function() {
  return this.collection.drop();
};