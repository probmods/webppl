var assert = require('assert');
var Tensor = require('adnn/tensor');
// var ad = require('adnn/ad');
var ad = require('../src/ad.js'); // Get Paul's extra functions
var nn = require('adnn/nn');
var erp = require('../src/erp.js');
var LRU = require('lru-cache');
var serialize = require('../src/util').serialize;

//this sets the size of the context network throughout daipp
var latentSize = 10

function cumProd(dims) {
  var size = 1;
  var n = dims.length;
  while (n--) size *= dims[n];
  return size;
}


// dritchie: We need a function that wraps any call to nn.eval(), which will do parameter registration
// IMPORTANT: We assume that every nn has been given a name, which we use for the param name/address
// -------------
// Doing this in raw WebPPL would be incorrect; the address at each call to eval() could be different,
//    and so we'd end up registering multiple sets of parameters for the same network
// Doing parameter registration on nn creation would allow us to use the current address, but presents
//    other problems: (1) some nets are created at the global scope, outside any inference thunk (see
//    the nets in DAIPP.wppl); (2) other nets are memoized, so parameter registration will not happen
//    if multiple coroutines are called (e.g. in EUBO followed by SMC, params passed into SMC will not
//    be registered to the nn's because their cached creation functions won't be called again).
// -------------
function nneval(nn, arg) {
  // TODO: parameter registration (only if the nn has > 0 parameters)
  // We will need a non-CPS'ed 'registerParams' that takes an explicit name/address
  // This also needs to incorporate the base address of the current coroutine, so that the parameter
  //    relative addressing scheme works, and also so nested inference works with DAIPP.

  // registerParams is made globally available in the WebPPL header.
  if (nn.getParameters().length > 0) {
    registerParams(nn.name, nn.getParameters.bind(nn), nn.setParameters.bind(nn));
  }

  // Fast version, assuming all nets take at most one argument
  return nn.eval(arg);

  // Less efficient, fully-general version using varargs
  // var NN = Object.getPrototype(nn);
  // return NN.eval.apply(nn, Array.prototype.slice.call(arguments, 1));
}


//val2vec takes an object and turns it into a vector.
function val2vec(val) {
  //NOTE: Number arrays (w/ fixed dim?) should be upgraded to tensor by hand
  //TODO: cache this for speed? we are likely to see the same values may times, especially for structured objects, eg address vectors.

// console.log("val: "+ad.value(val)+" type "+betterTypeOf(val))

  switch(betterTypeOf(val)) {
    case 'number':
      //numbers are upgraded to tensor.
      //NOTE: integers currently treated as real, but could treat as Enum or one-hot.
      //NOTE: number may be lifted.
      val = ad.scalarsToTensor(val);
    case 'tensor':
      //tensors are re-shaped and pushed through an MLP to get right dim
      //NOTE: tensor may be lifted.
      var len = ad.value(val).length;
      return nneval(tensorAdaptor(len, 'tensor_'+len), val);
    case 'array':
      //arrays are handled inductively
      //TODO: change init so that an array with one elt gets the same vec as the elt?
      var initvec = val2vec("emptyarrayvec");
      var arrayRNN = tensorAdaptor(2*latentSize, 'arrayRNN');
      return val.reduce(function(vec, next){
                          return nneval(arrayRNN, ad.tensor.concat(vec, val2vec(next)));
                        },
                        initvec);
    case "function":
        //TODO: functions currently treated as object, so interesting things happen only if they provide an embed2vec... is there a smart default?
    case "object":
      //check if object provides embed2vec method, if so call it.
      //embed2vec methods take vec dim and callback to val2vec, return ebedding vector.
      //TODO: handle tensors by adding embed2vec method to tensor class? arrays?
      if (val.embed2vec !== undefined) {
        return val.embed2vec(val2vec, latentSize)
      }
      //otherwise treat as enum: only equal objects have same vec.
      return nneval(getConstant(val));

      // FIXME: The fall through here means the all objects not
      // implementing embed2vec are treat as null. Fix by checking
      // cache handles null and removing the case below? I'd also be
      // tempted to not rely on fall through at all, it's a frequent
      // source of bugs.
    case "null":
      val = "iamnull" //just in case cache doesn't deal properly with null key.
    default:
      //default case: treat as enum type and memoize embedding vector.
      //this catches, boolean, string, symbol, etc.
      return nneval(getConstant(val));
  }
}

var tensorAdaptor = cache(function(length, name){
  // dritchie: Should this be an MLP with a hidden layer + activation?
  var net = nn.linear(length, latentSize, name);
  net.setTraining(true);
  return net;
});

var getConstant = cache(function(val) {
  var name = serialize(val);
  var net = nn.constantparams([latentSize], name);
  net.setTraining(true);
  return net;
});

function betterTypeOf(val) {
  var type = typeof val
  if (type === 'object' && val === null) {
    return 'null';
  } else if (type === 'object' && ad.isLifted(val)) {
    return betterTypeOf(ad.value(val));
  } else if (type === 'object' && Array.isArray(val)) {
    return 'array';
  } else if (type === 'object' && val instanceof Tensor) {
    return 'tensor';
  } else {
    return type;
  }
}

/*
This goes from a vector (created from context etc) to an importance distribution.
ERP + params is the target distribution
This function is responsible for deciding which importance ERP to use, and it’s params. Returns [guideERP, guideParams].
*/
function vec2dist(vec, ERP, params) {
  var guideERP, guideParamNets;
  if (ERP === erp.bernoulliERP) {
    //importance ERP is Bernoulli, param is single bounded real
    guideERP = erp.bernoulliERP; // dritchie: Should be mvBernoulliERP, b/c of tensor params?
    guideParamNets = makeParamAdaptorNets([{dim:[1], dom:[0,1]}], 'Bernoulli');
  } else if (ERP === erp.gaussianERP) {
    //importance ERP is mixture of Gaussians, params are means and logvars for the components
    // TODO: How to set ncomponents?
    //var ncomponents = 2;
    //guideERP = GaussianMixtureERP;  // FIXME: Need to write GaussianMixtureERP
    //guideParamNets = makeParamAdaptorNets([[ncomponents], [ncomponents]], 'GMM');
    // Guide with single Gaussian until we have mixture ERP.
    guideERP = erp.gaussianERP;
    guideParamNets = makeParamAdaptorNets([[1], {dim: [1], dom: [0, Infinity]}], 'Gaussian');
  } else if (ERP === erp.gammaERP) {
    guideERP = erp.gammaERP;
    guideParamNets = makeParamAdaptorNets([{dim: [1], dom: [0, Infinity]}, {dim: [1], dom: [0, Infinity]}], 'Gamma');
  } else if (ERP === erp.diagCovGaussianERP) {
    guideERP = ERP;
    var erpDim = ad.value(params[0]).length;
    guideParamNets = makeParamAdaptorNets([[erpDim, 1], {dim: [erpDim, 1], dom: [0, Infinity]}], 'diagCovGaussianERP');
  } else if (ERP === erp.dirichletERP) {
    guideERP = erp.logisticNormalERP;
    var erpDim = ad.value(params[0]).length;
    guideParamNets = makeParamAdaptorNets([[erpDim-1, 1], {dim: [erpDim-1, 1], dom: [0, Infinity]}], 'Dirichlet');
  } else {
    throw 'daipp: Unhandled ERP type in vec2dist: ' + ERP.name;
  }
  // TODO: Other ERPs: dirichlet, beta, gamma, etc.?
  return [
    guideERP,
    guideParamNets.map(function(net) {
      // dritchie: Extract scalars from singleton tensors? (see comment on makeParamAdaptorNets below)
      // paul: the mismatch between tensor valued guide params and
      // scalar valued erp params isn't specific to daipp. we might
      // consider moving this into erps.
      var out = nneval(net, vec);
      var _out = ad.value(out);
      return (_out instanceof Tensor) && isSingleton(_out) ? ad.tensorEntry(out, 0) : out;
    })
  ];
}

function isSingleton(t) {
  return t.rank === 1 && t.dims[0] === 1;
}

// This function creates an adaptor network that goes from the fixed-size predict vector to whatever size and shape are needed
//   in the importance ERPs... if domains are provided on the return tensors then a rescaling function is applied.
// sizes is an array of tensor shapes. if a shape is an array it is assumed to be the tensor dims and the domain unbounded;
//    if it is an object, it is assumed to have fields for dim and domain bounds.
// eg. [{dim:[1],dom:[0,Infinity]}, [2,2]] means ERP params will be a singleton tensor scaled to positive reals and an unbounded
//    2x2 matrix tensor.
// name arg is just there so that different ERPs with same shape params can get different adaptors.
// NOTE: this assumes params to importance ERPs are always tensor...
//    dritchie: Currently, this seems to be true for: mvBernoulli, mvGaussian, diagCovGaussian, matrixGaussian, discrete,
//       discreteOneHot, dirichlet, logisticNormal
//    *OR* we can look for singleton tensors and do an ad.tensorEntry(vec, 0) to turn tensor params into scalar ones...
var makeParamAdaptorNets = cache(function(sizes, name) {
  var nets = [];
  for (var i = 0; i < sizes.length; i++) {
    var size = sizes[i];
    var dim = (size.dim === undefined) ? size : size.dim;
    var flatlength = cumProd(dim);
    // dritchie: Should this be an MLP with a hidden layer + activation?
    var net = nn.linear(latentSize, flatlength);
    if (size.dom !== undefined){
      net = nn.sequence([net, getSquishnet(size.dom[0], size.dom[1])]);
    }
    // Only do reshape if dim has rank > 1
    if (dim.length > 1) {
      net = nn.sequence([net, nn.reshape(dim)]);
    }
    var netname = name + '_' + i;
    net.name = netname;
    net.setTraining(true);
    nets.push(net);
  }
  return nets;
});

//helper to squish return vals into range [a,b]
// dritchie: here I'm using Paul's add and mul functions which work on (Tensor, scalar) args
var getSquishnet = cache(function(a, b) {
  assert(!(a === -Infinity && b === Infinity)); // Should use no bounds, in this case
  var adfun;
  if (a === -Infinity) {
    adfun = function(x) {
      // Use soft-plus instead of exp
      // var y = ad.tensor.exp(x);
      var y = ad.tensor.log(ad.tensor.add(ad.tensor.exp(x), 1));
      return ad.tensor.add(ad.tensor.neg(y), b);
    };
  } else if (b === Infinity) {
    adfun = function(x) {
      // Use soft-plus instead of exp
      // var y = ad.tensor.exp(x);
      var y = ad.tensor.log(ad.tensor.add(ad.tensor.exp(x), 1));
      return ad.tensor.add(y, a);
    };
  } else {
    adfun = function(x){
      var y = ad.tensor.sigmoid(x);
      return ad.tensor.add(ad.tensor.mul(y, b-a), a);
    };
  }
  return nn.lift(adfun) // No need to name this net, since it has no params
});

// Caching.
//TODO: should this be in utils?
function cache(f, maxSize) {
  var c = LRU(maxSize);
  var cf = function() {
    var args = Array.prototype.slice.call(arguments);
    var stringedArgs = serialize(args);
    if (c.has(stringedArgs)) {
      return c.get(stringedArgs);
    } else {
      //TODO: check for recursion, cache size, etc?
      var r = f.apply(this, args);
      c.set(stringedArgs, r);
      return r
    }
  }
  return cf
}

module.exports = {
  latentSize: latentSize,
  nneval: nneval,
  val2vec: val2vec,
  vec2dist: vec2dist
}