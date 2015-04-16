module.exports = WriteResult;

function WriteResult(result, type) {
  var _this = this;

  this.type = type;
  for (var key in result) {
    this[key] = result[key];
  }

  Object.defineProperty(this, 'nInserted', {
    get: function() {
      if (type === 'insert') {
        return _this.n || 0;
      }
      return 0;
    },
    enumerable: false
  });

  Object.defineProperty(this, 'nMatched', {
    get: function() {
      if (type === 'update') {
        return _this.n || 0;
      }
      return 0;
    },
    enumerable: false
  });

  if (typeof this.nModified === 'undefined') {
    Object.defineProperty(this, 'nModified', {
      get: function() {
        return 0;
      },
      enumerable: false
    });
  }

  Object.defineProperty(this, 'nRemoved', {
    get: function() {
      if (type === 'remove') {
        return _this.n || 0;
      }
      return 0;
    },
    enumerable: false
  });

  Object.defineProperty(this, 'nUpserted', {
    get: function() {
      if (type === 'save' && Array.isArray(_this.upserted)) {
        return _this.upserted.length;
      }
      return 0;
    },
    enumerable: false
  });
};

WriteResult.prototype.getWriteError = function() {
  if (!this.ok) {
    return this;
  }
};

WriteResult.prototype.getWriteConcernError = function() {
};

WriteResult.prototype.getUpsertedId = function() {
  if (Array.isArray(this.upserted) && this.upserted.length) {
    return this.upserted[0];
  }
  return undefined;
};

WriteResult.prototype.hasWriteConcernError = function() {
  return false;
};

WriteResult.prototype.hasWriteErrors = function() {
  return !this.errmsg;
};
