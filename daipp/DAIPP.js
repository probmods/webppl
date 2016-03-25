var Tensor = require('adnn/tensor');
var ad = require('adnn/ad');
var nn = require('adnn/nn');
var erp = require('src/erp.js') //FIXME: right require?
var LRU = require('lru-cache');
var serialize = require('./util').serialize


function cumProd(dims) {
  var size = 1;
  var n = dims.length;
  while (n--) size *= dims[n];
  return size;
}

//FIXME: latentSize should agree with DAIPP.wppl
var latentSize = 10

//val2vec takes an object and turns it into a vector.
function val2vec(val) {
  //NOTE: Number arrays (w/ fixed dim?) should be upgraded to tensor by hand
  //TODO: cache this for speed? we are likely to see the same values may times, especially for structured objects, eg address vectors.

  switch(betterTypeOf(val)) {
    case 'number':
      //numbers are upgraded to tensor.
      //NOTE: integers currently treated as real, but could treat as Enum or one-hot.
      val = new Tensor([1]).fill(val);
    case 'tensor':
      //tensors are re-shaped and pushed through an MLP to get right dim
      return tensorAdaptor(val.length).eval(val);
    case 'array':
      //arrays are handled inductively
      var initvec = val2vec("emptyarrayvec");
      var arrayRNN = tensorAdaptor([2*latentSize], 'arrayRNN');
      return val.reduce(function(vec, next){
                          return arrayRNN.eval(ad.tensor.concat(vec, val2vec(next)))},
                        initvec);
    case "function":
        //TODO: functions currently treated as object, so interesting things happen only if they provide an embed2vec... is there a smart default?
    case "object":
      //check if object provides embed2vec method, if so call it.
      //embed2vec methods take vec dim and callback to val2vec, return ebedding vector.
      //TODO: handle tensors by adding embed2vec method to tensor class? arrays?
      if (val.embed2vec !== null) {
        return val.embed2vec(this, latentSize)
      }
      //otherwise treat as enum: only equal objects have same vec.
    case "null":
      val = "iamnull" //just in case cache doesn't deal properly with null key.
    default:
      //default case: treat as enum type and memoize embedding vector.
      //this catches, boolean, string, symbol, etc.
      return getConstant(val);
  }
}

var tensorAdaptor = cache(function(length, name){
  // TODO: Should this be an MLP with a hidden layer + activation?
  var net = nn.linear(length, latentSize);
  net.setTraining(true)
  return net
})

var getConstant = cache(function(val) {
  return nn.constantparams([latentSize])
})

function betterTypeOf(val) {
  var type = typeof val
  if (type === "object" && val === null) {
    type = "null";
  }
  if (type === 'object' && Array.isArray(val)) {
    type = "array";
  }
  if (type === 'object' && val instanceof Tensor) {
    type = 'tensor';
  }
  return type;
}

/*
This goes from a vector (created from context etc) to an importance distribution.
ERP is the target ERP.
This function is responsible for deciding which importance ERP to use, and it’s params. Returns [guideERP, guideParams].
*/
function vec2importanceERP(vec, ERP) {
   if (ERP === erp.bernoulliERP) {
      //importance ERP is Bernoulli, param is single bounded real
      var theta = makeAdaptorNet([{dim:[1], dom:[0,1]}], 'Bernoulli').eval(vec)
      return [erp.bernoulliERP, theta];
    } else if (ERPtype === erp.gaussianERP) {
      //importance ERP is mixture of Gaussians, params are means and logvars for the components
      // TODO: How to set ncomponents?
      var ncomponents = 2;
      var meansAndLogVars = makeAdaptorNet([[ncomponents], [ncomponents]], 'GMM').eval(vec);
      // FIXME: Need to write GaussianMixtureERP
      // (dritchie: I have some code for this @ https://github.com/dritchie/webppl/blob/variational-neural/src/erp.js)
      return [GaussianMixtureERP, meansAndLogVars];
    } else if (ERP === erp.dirichletERP) {
      //FIXME: importance ERP is??
    }
  //otherwise throw an error....
  // TODO: What about beta, gamma, etc.?
}

// This function creates an adaptor network that goes from the fixed-size predict vector to whatever size and shape are needed
//   in the importance ERPs... if domains are provided on the return tensors then a rescaling function is applied.
// sizes is an array of tensor shapes. if a shape is an array it is assumed to be the tensor dims and the domain unbounded;
//    if it is an object, it is assumed to have fields for dim and domain bounds.
// eg. [{dim:[1],dom:[0,Infinity]}, [2,2]] means ERP params will be a singleton tensor scaled to positive reals and an unbounded
//    2x2 matrix tensor.
// name arg is just there so that different ERPs with same shape params can get different adaptors.
// NOTE: this assumes params to importance ERPs are always tensor...
var makeAdaptorNet = cache(function(sizes, name) {
  var nets = [];
  for (var i = 0; i < sizes.length; i++) {
    var size = sizes[i];
    var dim = (size.dim==null) ? size : size.dim;
    var flatlength = cumProd(dim);
    // TODO: Should this be an MLP with a hidden layer + activation?
    var net = nn.linear(latentSize, flatlength);
    if (size.dom != null){
      net = nn.sequence([net, getSquishnet(size.dom[0],size.dom[1])]);
    }
    net = nn.sequence([net, nn.reshape([dim)]);
    net.setTraining(true);
    nets.push(net);
  }
  return nets;
})

//helper to squish return vals into range [a,b]
//FIXME: deal with Infinity bounds.
function getSquishnet(a,b) {
  //FIXME: is this right? need to lift / resize a and b?
  adfun = function(x){return ad.tensor.plus(a,ad.tensor.mul(b-a, ad.tensor.sigmoid(x)))}
  return nn.lift(adfun)
}

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
      //TODO: check for recursion, cahce size, etc?
      var r = f.apply(this, args);
      c.set(stringedArgs, r);
      return r
    }
  }
  return cf
}

module.exports = {
  val2vec: val2vec,
  vec2importanceERP: vec2importanceERP
}
