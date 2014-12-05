var mongodb = require("mongodb");
var util = require("util");
function ObjectId(id) {
  if(!(this instanceof ObjectId)) {
    return new ObjectId(id);
  }
  if (id) {
    this.oid = mongodb.ObjectID.createFromHexString(id);
  } else {
    this.oid = new mongodb.ObjectID();
  }
  var _this = this;
  Object.defineProperty(this, "str", {
    enumerable: true,
    value: _this.oid.toHexString()
  });
}

Object.prototype.getTimestamp = function() {
  return this.oid.getTimestamp();
};

ObjectId.prototype.toString = function() {
  return util.format("ObjectId(\"%s\")", this.str);
};

ObjectId.prototype.equals = function(otherId) {
  return this.oid.equals(otherId.oid);
}

module.exports = {
  ObjectId: ObjectId,
  DBRef: mongodb.DBRef,
  MinKey: mongodb.MinKey,
  MaxKey: mongodb.MaxKey,
  Symbol: mongodb.Symbol,
  Timestamp: mongodb.Timestamp
};
