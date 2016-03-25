var Tensor = require('adnn/tensor');
var ad = require('adnn/ad');
var nn = require('adnn/nn');


function cumProd(dims) {
  var size = 1;
  var n = dims.length;
  while (n--) size *= dims[n];
  return size;
}

//Two key helper functions, that go between program values and network.

//FIXME: need cache, latentSize,

//val2vec takes an object and turns it into a vector.
function val2vec(val) {
  //NOTE: Number arrays (w/ fixed dim?) should be upgraded to tensor by hand
  //NOTE: integers initially treated as real, but could treat as Enum or one-hot.
  //NOTE: make sure null embeds to something sensible.
  //TODO: cache this for speed? we are likely to see the same values may times, especially for structured objects, eg address vectors.

  switch(betterTypeOf(val)) {
    case 'number':
      //numbers (currently real and integer) are upgraded to tensor
      val = new Tensor([1]).fill(val);
    case 'tensor':
      //tensors are re-shaped and pushed through an MLP to get right dim
      return tensorAdaptor(val.length).eval(val);
    case 'array':
      //arrays are handled inductively
      // TODO: What about empty arrays?
      var arrayRNN = tensorAdaptor([2*latentSize], 'arrayRNN');
      return val.reduce(function(vec, next){return arrayRNN.eval(ad.tensor.concat(vec, val2vec(next)))});
    case "object":
      //TODO: check if object provides embed2vec method, if so call it:
      if (val hasOwn embed2vec) {
        return val.embed2vec(this, latentSize) //embed2vec methods take vec dim and callback to val2vec, return ebedding vector.
      }
      //otherwise treat as enum: only equal objects have same vec.
    case "function":
      //TODO: how should we treat functions? ignore them? treat as single function vector?
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
ERPtype is the name of an ERP.
This function is responsible for deciding which importance ERP to use, and it’s params. Returns [guideERP, guideParams].
*/
// TODO: Why not have ERPtype actually be an ERP object?
function vec2importanceERP(vec, ERPtype) {
   if (ERPtype === 'Bernoulli') {
      //importance ERP is Bernoulli, param is single bounded real
      var theta = makeAdaptorNet([{dim:[1], dom:[0,1]}], 'Bernoulli').eval(vec)
      //FIXME: deal with domain re-scaling to [0,1]
      return [BernoulliERP, theta];
    } else if (ERPtype == 'Gaussian') {
      //importance ERP is mixture of Gaussians, params are means and logvars for the components
      // TODO: How to set ncomponents?
      var ncomponents = 2;
      var meansAndLogVars = makeAdaptorNet([[ncomponents], [ncomponents]], 'GMM').eval(vec);
      // TODO: Need to write GaussianMixtureERP
      // (dritchie: I have some code for this @ https://github.com/dritchie/webppl/blob/variational-neural/src/erp.js)
      return [GaussianMixtureERP, meansAndLogVars];
    } else if (ERPtype == 'Dirichlet') {
      //importance ERP is??
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
      // TODO: rescaling to enforce domain bounds
      var squishnet = ???;
      net = nn.sequence([net, squishnet]);
    }
    net = nn.sequence([net, nn.reshape([dim)]);
    net.setTraining(true);
    nets.push(net);
  }
  return nets;
})

/*
A future, more flexible version of generateImportanceERP could take an ERPtype which is an object describing the signature of
   the return value from the original ERP. Some type signatures:
{type: 'Boolean'}
{type: 'Real', domain: [min, max]}
Also probably want to support Tensor, Simplex, ...?

Eventually need to get consistent with new ERP/sample interface. once ERPs are distributions (that don't directly take params)
   the return value here can just be the importance ERP, with params already taken into account.
*/


module.exports = {
  val2vec: val2vec,
  vec2importanceERP: vec2importanceERP
}
