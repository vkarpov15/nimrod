module.exports = WriteResult;

function WriteResult(result, type) {
  var _this = this;

  for (var key in result) {
    console.log(key);
    this[key] = result[key];
  }

  Object.defineProperty(this, 'nInserted', {
    get: function() {
      if (type === 'insert') {
        return _this.n;
      }
      return 0;
    },
    enumerable: false
  });

  Object.defineProperty(this, 'nMatched', {
    get: function() {
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
        return _this.n;
      }
      return 0;
    },
    enumerable: false
  });

  Object.defineProperty(this, 'nUpserted', {
    get: function() {
      console.log('Getting nUpserted for ' + type + ' ' + require('util').inspect(_this.upserted));
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
    return this.errmsg;
  }
};

WriteResult.prototype.getWriteConcernError = function() {
};

WriteResult.prototype.getUpsertedId = function() {
};