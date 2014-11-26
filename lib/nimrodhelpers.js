// store nimrod helpers here

var AggregationCursor = function(conn, cursor) {
  this.__proto__ = cursor;

  var closed = false;
  this.close = function() {
    cursor.close(conn.flow.add());
    closed = true;
    return conn.flow.wait();
  };

  this.explain = function() {
    cursor.explain(conn.flow.add());
    return conn.flow.wait();
  };

  this.toArray = function() {
    var ret = [];
    while (this.hasNext()) {
      ret.push(this.next());
    }
    return ret;
  };

  var nextDoc;
  var hasNextCalled = false;
  this.hasNext = function() {
    if (!hasNextCalled) {
      cursor.next(conn.flow.add());
      nextDoc = conn.flow.wait();
    }
    hasNextCalled = true;
    return (closed ? false : nextDoc !== null);
  };

  this.next = function() {
    if (closed) {
      return null;
    }

    this.hasNext();
    hasNextCalled = false;
    return nextDoc;
  };

  return this;
};

Array.sum = function(arr){
  if (arr.length == 0)
    return null;
  var s = arr[0];
  for (var i=1; i<arr.length; i++)
    s += arr[i];
  return s;
}

Array.avg = function(arr){
  if (arr.length == 0)
    return null;
  return Array.sum(arr) / arr.length;
}

Array.stdDev = function(arr){
  var avg = Array.avg(arr);
  var sum = 0;

  for (var i=0; i<arr.length; i++){
    sum += Math.pow(arr[i] - avg, 2);
  }

  return Math.sqrt(sum / arr.length);
}

// Object
Object.extend = function(dst, src, deep){
  for (var k in src){
    var v = src[k];
    if (deep && typeof(v) == "object"){
      if ("floatApprox" in v) { // convert NumberLong properly
        eval("v = " + tojson(v));
      } else {
        v = Object.extend(typeof (v.length) == "number" ? [] : {}, v, true);
      }
    }
    dst[k] = v;
  }
  return dst;
}

Object.merge = function(dst, src, deep){
  var clone = Object.extend({}, dst, deep)
  return Object.extend(clone, src, deep)
}

Object.keySet = function(o) {
  var ret = new Array();
  for(var i in o) {
    if (!(i in o.__proto__ && o[ i ] === o.__proto__[ i ])) {
      ret.push(i);
    }
  }
  return ret;
}

module.exports = {
  AggregationCursor: AggregationCursor,

  Array: Array,

  Object: Object,

  extend: function(dst, src) {
    for (var k in src) {
      if (src.hasOwnProperty(k)) {
        dst[k] = src[k];
      }
    }
    return dst;
  },

  collectionExists: function(conn, collName) {
    conn.db.collectionNames(collName, conn.flow.add());
    var result = conn.flow.wait();
    return result.length > 0;
  },

  runCommand: function(conn, obj) {
    conn.db.command(obj, conn.flow.add());
    return conn.flow.wait();
  },

  runAdminCommand: function(conn, obj) {
    conn.db.admin().command(obj, conn.flow.add());
    return conn.flow.wait();
  },

  cleanupDocs: function(res) {
    // TODO: need a better solution for this
    if (!res) {
      return null;
    }
    if ("cursorId" in res && ("documents" in res || "items" in res)) {
      res = res.documents || res.items;
    }
    if (res instanceof Array && res.length === 1) {
      res = res[0];
    }
    return res;
  }
};

