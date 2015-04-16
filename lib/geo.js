exports.distance = function(a, b) {
  var ax = null;
  var ay = null;
  var bx = null;
  var by = null;

  for (var key in a) {
    if (ax == null) {
      ax = a[key];
    } else if (ay == null) {
      ay = a[key];
    }
  }

  for (var key in b) {
    if (bx == null) {
      bx = b[key];
    } else if (by == null) {
      by = b[key];
    }
  }

  return Math.sqrt(Math.pow(by - ay, 2) + Math.pow(bx - ax, 2));
};

exports.sphereDistance = function(a, b) {
  var ax = null;
  var ay = null;
  var bx = null;
  var by = null;

  for (var key in a) {
    if (ax == null) {
      ax = a[key] * (Math.PI / 180);
    } else if (ay == null) {
      ay = a[key] * (Math.PI / 180);
    }
  }

  for (var key in b) {
    if (bx == null) {
      bx = b[key] * (Math.PI / 180);
    } else if (by == null) {
      by = b[key] * (Math.PI / 180);
    }
  }

  var sin_x1 = Math.sin(ax), cos_x1 = Math.cos(ax);
  var sin_y1 = Math.sin(ay), cos_y1 = Math.cos(ay);
  var sin_x2 = Math.sin(bx), cos_x2 = Math.cos(bx);
  var sin_y2 = Math.sin(by), cos_y2 = Math.cos(by);

  var crossProduct =
    (cos_y1*cos_x1 * cos_y2*cos_x2) +
    (cos_y1*sin_x1 * cos_y2*sin_x2) +
    (sin_y1        * sin_y2);

  if (crossProduct >= 1 || crossProduct <= -1){
    return crossProduct > 0 ? 0 : Math.PI;
  }

  return Math.acos(crossProduct);
};
