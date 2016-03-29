'use strict';

var _ = require('underscore');
var ad = require('adnn/ad');
var Tensor = require('./tensor');
var util = require('./util');
var special = require('./special');

// TODO: Get this stuff into adnn?

// TODO: Handle tensors.
// This requires preserving the prototype (see #384) and handling
// Float64Arrays. We can /consider/ switching all the (params &&
// params.map(ad.value)) to ad.valueRec(params) once this is done.
var valueRec = function(x) {
  if (ad.isLifted(x)) {
    return x.x;
  } else if (_.isArray(x)) {
    return _.map(x, valueRec);
  } else if (_.isObject(x) && !_.isFunction(x)) {
    // Ensure prototype chain is preserved
    var proto = Object.getPrototypeOf(x);
    var y = _.mapObject(x, valueRec);
    return _.extendOwn(Object.create(proto), y);
    return y;
  } else {
    return x;
  }
};

ad.valueRec = valueRec;

ad.tensor.reshape = ad.newFunction({
  OutputType: Tensor,
  name: 'reshape',
  forward: function(t, shape) {
    t = ad.isLifted(t) ? t.x : t;
    if (t.length !== util.product(shape)) {
      throw 'Size mismatch in reshape.';
    }
    // This does the conservative thing of copying the data. (Similar
    // to transpose.) Is that necessary?
    return new Tensor(shape).fromFlatArray(t.data);
  },
  backward: function(t, shape) {
    if (ad.isLifted(t)) {
      var n = t.x.length;
      while (n--) {
        t.dx.data[n] += this.dx.data[n];
      }
    }
  },
  getParents: function(t, shape) {
    return ad.isLifted(t) ? [t] : [];
  }
});

ad.tensor.transpose = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'transpose',
  forward: function(a) {
    return a.T();
  },
  backward: function(a) {
    var h = this.x.dims[0];
    var w = this.x.dims[1];
    for (var i = 0; i < h; i++) {
      for (var j = 0; j < w; j++) {
        a.dx.data[j * h + i] += this.dx.data[i * w + j];
      }
    }
  }
});

ad.tensor.diag = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'diag',
  forward: function(a) {
    return a.diag();
  },
  backward: function(a) {
    var n = a.dx.dims[0];
    for (var i = 0; i < n; i++) {
      a.dx.data[i] += this.dx.data[i * (n + 1)];
    }
  }
});

ad.tensor.inv = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'inverse',
  forward: function(A) {
    return A.inv();
  },
  backward: function(A) {
    var xT = this.x.T();
    A.dx = A.dx.add(xT.dot(this.dx).dot(xT).neg());
  }
});

ad.tensor.det = ad.newUnaryFunction({
  OutputType: Number,
  name: 'determinant',
  forward: function(A) {
    return A.det();
  },
  backward: function(A) {
    // A is square matrix.
    // Assume A is invertable.
    var n = A.x.dims[0];
    var invA = A.x.inv();
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        A.dx.data[i * n + j] += this.x * this.dx * invA.data[j * n + i];
      }
    }
  }
});

ad.tensor.dot = ad.newBinaryFunction({
  OutputType: Tensor,
  name: 'dot',
  forward: function(a, b) {
    return a.dot(b);
  },
  backward1: function(A, B) {
    var Ap = ad.value(A);
    var Bp = ad.value(B);

    var Ah = Ap.dims[0];
    var Aw = Ap.dims[1];
    var Bw = Bp.dims[1];
    var wout = Bw;

    for (var l = 0; l < Ah; l++) {
      for (var m = 0; m < Aw; m++) {
        var z = 0;
        for (var j = 0; j < wout; j++) {
          z += this.dx.data[l * wout + j] * Bp.data[m * Bw + j];
        }
        A.dx.data[l * Aw + m] += z;
      }
    }
  },
  backward2: function(A, B) {
    var Ap = ad.value(A);
    var Bp = ad.value(B);

    var Ah = Ap.dims[0];
    var Aw = Ap.dims[1];
    var Bh = Bp.dims[0];
    var Bw = Bp.dims[1];
    var wout = Bw;

    for (var l = 0; l < Bh; l++) {
      for (var m = 0; m < Bw; m++) {
        var z = 0;
        for (var i = 0; i < Ah; i++) {
          z += this.dx.data[i * wout + m] * Ap.data[i * Aw + l];
        }
        B.dx.data[l * Bw + m] += z;
      }
    }

  }
});

ad.tensor.sumreduce = ad.newUnaryFunction({
  OutputType: Number,
  name: 'sumreduce',
  forward: function(a) {
    return a.sumreduce();
  },
  backward: function(a) {
    var n = a.x.length;
    for (var i = 0; i < n; i++) {
      a.dx.data[i] += this.dx;
    }
  }
});

ad.tensor._add = ad.tensor.add;

// This version supports the case where b is a scalar. a is always a
// tensor.
ad.tensor.add = ad.newBinaryFunction({
  OutputType: Tensor,
  name: 'add',
  forward: function(a, b) {
    return a.add(b);
  },
  backward1: function(a, b) {
    var n = a.x.length;
    for (var i = 0; i < n; i++) {
      a.dx.data[i] += this.dx.data[i];
    }
  },
  backward2: function(a, b) {
    var i;
    var _a = ad.value(a);
    var n = _a.length;
    if (b.x instanceof Tensor) {
      for (i = 0; i < n; i++) {
        b.dx.data[i] += this.dx.data[i];
      }
    } else if (typeof b.x === 'number') {
      for (i = 0; i < n; i++) {
        b.dx += this.dx.data[i];
      }
    } else {
      throw 'Unknown type.';
    }
  }
});

ad.tensor._sub = ad.tensor.sub;

// This version supports the case where b is a scalar. a is always a
// tensor.
ad.tensor.sub = ad.newBinaryFunction({
  OutputType: Tensor,
  name: 'sub',
  forward: function(a, b) {
    return a.sub(b);
  },
  backward1: function(a, b) {
    var n = a.x.length;
    for (var i = 0; i < n; i++) {
      a.dx.data[i] += this.dx.data[i];
    }
  },
  backward2: function(a, b) {
    var i;
    var _a = ad.value(a);
    var n = _a.length;
    if (b.x instanceof Tensor) {
      for (i = 0; i < n; i++) {
        b.dx.data[i] -= this.dx.data[i];
      }
    } else if (typeof b.x === 'number') {
      for (i = 0; i < n; i++) {
        b.dx -= this.dx.data[i];
      }
    } else {
      throw 'Unknown type.';
    }
  }
});

ad.tensor._mul = ad.tensor.mul;

// This version supports the case where b is a scalar. a is always a
// tensor.
ad.tensor.mul = ad.newBinaryFunction({
  OutputType: Tensor,
  name: 'mul',
  forward: function(a, b) {
    return a.mul(b);
  },
  backward1: function(a, b) {
    var n = a.x.length;
    var _b = ad.value(b);
    var i;
    if (_b instanceof Tensor) {
      for (i = 0; i < n; i++) {
        a.dx.data[i] += this.dx.data[i] * _b.data[i];
      }
    } else if (typeof _b === 'number') {
      for (i = 0; i < n; i++) {
        a.dx.data[i] += this.dx.data[i] * _b;
      }
    } else {
      throw 'Unknown type.';
    }
  },
  backward2: function(a, b) {
    var i;
    var _a = ad.value(a);
    var n = _a.length;
    if (b.x instanceof Tensor) {
      for (i = 0; i < n; i++) {
        b.dx.data[i] += this.dx.data[i] * _a.data[i];
      }
    } else if (typeof b.x === 'number') {
      for (i = 0; i < n; i++) {
        b.dx += this.dx.data[i] * _a.data[i];
      }
    } else {
      throw 'Unknown type.';
    }
  }
});

ad.tensor._div = ad.tensor.div;

// This version supports the case where b is a scalar. a is always a
// tensor.
ad.tensor.div = ad.newBinaryFunction({
  OutputType: Tensor,
  name: 'div',
  forward: function(a, b) {
    return a.div(b);
  },
  backward1: function(a, b) {
    var n = a.x.length;
    var _b = ad.value(b);
    var i;
    if (_b instanceof Tensor) {
      for (i = 0; i < n; i++) {
        a.dx.data[i] += this.dx.data[i] / _b.data[i];
      }
    } else if (typeof _b === 'number') {
      for (i = 0; i < n; i++) {
        a.dx.data[i] += this.dx.data[i] / _b;
      }
    } else {
      throw 'Unknown type.';
    }
  },
  backward2: function(a, b) {
    var i;
    var _a = ad.value(a);
    var n = _a.length;
    if (b.x instanceof Tensor) {
      for (i = 0; i < n; i++) {
        var b_i = b.x.data[i];
        b.dx.data[i] -= this.dx.data[i] * _a.data[i] / (b_i * b_i);
      }
    } else if (typeof b.x === 'number') {
      for (i = 0; i < n; i++) {
        b.dx -= this.dx.data[i] * _a.data[i] / (b.x * b.x);
      }
    } else {
      throw 'Unknown type.';
    }
  }
});

ad.tensor.neg = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'neg',
  forward: function(a) {
    return a.neg();
  },
  backward: function(a) {
    var n = a.dx.length;
    for (var i = 0; i < n; i++) {
      a.dx.data[i] -= this.dx.data[i];
    }
  }
});

ad.tensor.logGamma = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'logGamma',
  forward: function(a) {
    return a.logGamma();
  },
  backward: function(a) {
    var n = a.x.length;
    while (n--) {
      a.dx.data[n] += special.digamma(a.x.data[n]) * this.dx.data[n];
    }
  }
});

ad.scalar.logGamma = ad.newUnaryFunction({
  OutputType: Number,
  name: 'logGamma',
  forward: function(a) {
    return special.logGamma(a);
  },
  backward: function(a) {
    return a.dx += special.digamma(a.x) * this.dx;
  }
});

module.exports = ad;
