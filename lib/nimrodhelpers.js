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

module.exports = {
  AggregationCursor: AggregationCursor,

  extend: function(dst, src) {
    for (var k in src) {
      if (src.hasOwnProperty(k)) {
        dst[k] = src[k];
      }
    }
    return dst;
  },

  runCommand: function(conn, obj) {
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

