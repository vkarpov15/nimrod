var assert = require("assert");
var util = require("util");
var helpers = require("./nimrodhelpers");
var _ = require('underscore');

var additionalMethods = {
  automsg: function(msg) {
    assert.ok(eval(msg), msg);
  },
  docEq: assert.deepEqual,
  eq: assert.deepEqual,
  neq: assert.notEqual,
  commandWorked: function(res, msg) {
    assert.ok(res.ok == 1, msg);
  },
  commandFailed: function(res, msg) {
    assert.ok(res.ok == 0, msg);
  },
  throws: function(func, params, msg) {
    try {
      func.apply(null, params);
    }
    catch (e) {
      return e;
    }
    assert.ok(0, util.format("did not throw exception: %s", msg));
  },
  doesNotThrow: function(func, params, msg) {
    try {
      func.apply(null, params);
    } catch (e) {
      assert.ok(false, 'threw unexpected exception: ' + e + ' : ' + msg);
    }
  },
  between: function(a, b, c, msg, inclusive) {
    var mes = util.format("%s is not between %s and %s: %s", b, a, c, msg);
    if (inclusive == true || inclusive == undefined) {
      assert.ok(a <= b && b <= c, mes);
    } else {
      assert.ok(a < b && b < c, mes);
    }
  },
  betweenIn: function(a, b, c, msg) {
    this.between(a, b, c, msg, true);
  },
  betweenEx: function(a, b, c, msg) {
    this.between(a, b, c, msg, false);
  },
  lte: function(a, b, msg) {
    assert.ok(a <= b, util.format("%s is not less than or equal to %s: %s",
                                  a, b, msg));
  },
  lt: function(a, b, msg) {
    assert.ok(a < b, util.format("%s is not less than %s: %s",
                                  a, b, msg));
  },
  gte: function(a, b, msg) {
    assert.ok(a >= b, util.format("%s is not greater than or equal to %s: %s",
                                  a, b, msg));
  },
  gt: function(a, b, msg) {
    assert.ok(a > b, util.format("%s is not greater than %s: %s",
                                 a, b, msg));
  },
  close: function(a, b, msg, places) {
    if (places === undefined) {
      places = 4;
    }
    assert.ok(Math.round((a - b) * Math.pow(10, places)) == 0,
              util.format("%s is not equal to %s within %s places, diff: %s : %s",
                          a, b, places, (a - b), msg));
  },
  contains: function(val, arr, msg) {
    var wasIn = false;
    if (!arr.length) {
      for (var key in arr) {
        if (_.isEqual(arr[key], val)) {
          wasIn = true;
          break;
        }
      }
    } else {
      for (var i = 0; i < arr.length; ++i) {
        if (_.isEqual(arr[i], val)) {
          wasIn = true;
          break;
        }
      }
    }

    if (!wasIn) {
      assert(false);
    }
  },
  writeOK: function(res, msg) {
    assert.ok(res && res.result && res.result.ok, msg);
  },
  writeError: function(res, msg) {
    assert.ok(!res || !res.result || !res.result.ok, msg);
  },
  isnull: function(v, msg) {
    assert.equal(v, null, msg);
  }
};

additionalMethods.eq.automsg = function(a, b) {
  additionalMethods.eq(eval(a), eval(b), '[' + a + '] != [' + b + ']');
};

additionalMethods.throws.automsg = function(func, params) {
  additionalMethods.throws(func, params, func.toString());
};

additionalMethods.doesNotThrow.automsg = function(func, params) {
  additionalMethods.doesNotThrow(func, params, func.toString());
};

module.exports = function (val) {
  if (val) {
    assert.ok(val);
    return;
  }
};

module.exports.__proto__ = Proxy.create({
  getOwnPropertyNames: function() {
    return Object.getOwnPropertyNames(assert).concat(
      Object.keys(additionalMethods)
    );
  },
  getOwnPropertyDescriptor: function(proxy, key) {
    return {"writable": false,
            "enumerable": false,
            "configurable" : true
           };
  },
  getPropertyDescriptor: function(proxy, key) {
    return this.getOwnPropertyDescriptor(proxy, key);
  },
  get: function(proxy, key) {
    delete assert.throws;
    if (assert.hasOwnProperty(key)) {
      return assert[key];
    }
    return additionalMethods[key];
  }
});
