//Two key helper functions, that go between program values and network.

//FIXME: need cache,

//val2vec takes an object and turns it into a vector.
val2vec(val) {
  //NOTE: fixed dim arrays should be upgraded to tensor by hand.
  //NOTE: integers initially treated as real, but could treat as Enum or one-hot.
  //NOTE: make sure null embeds to something sensible.
  //TODO: cache this for speed? we are likely to see the same values may times, especially for structured objects, eg address vectors.

  switch(betterTypeOf(val)) {
    case "number":
      //numbers (currently real and integer) are upgraded to tensor
      val = ad.Tensor(val)
    case "tensor":
      //tensors are re-shaped and pushed through an MLP to get right dim
      return tensorAdaptor(val.dimensions).eval(val)
    case "array":
      //arrays are handled inductively
      var arrayRNN = tensorAdaptor([2*latentSize],'arrayRNN')
      return val.reduce(function(vec, next){return arrayRNN.eval(nn.tensor.concat(vec,val2vec(next)))})
    default:
      //default case: treat as enum type and memoize embedding vector.
      return getConstant(val)
  }
}

var tensorAdaptor = cache(function(size,name){
  var flatlength = size.cumProd() //TODO: cumProd
  var net = nn.seq([nn.flatten, nn.mlp(flatlength, [{nOut: latentSize}])]) //TODO:flatten?
  net.setTraining(true)
  return net
})

var getConstant = cache(function(val) {
  return nn.constantparams([latentSize])
})

betterTypeOf(val) {
  var type = typeof val
  if(type==="object" && Array.isArray(val)) {type = "array"}
  if(type==="object" && instanceof ad.Tensor) {type = "tensor"}
}

/*
This goes from a vector (created from context etc) to an importance distribution.
ERPtype is the name of an ERP.
This function is responsible for deciding which importance ERP to use, and it’s params. Returns [guideERP, guideParams].
*/
vec2importanceERP(vec,ERPtype) {
   if(ERPtype == 'Bernoulli') {
      //importance ERP is Bernoulli, param is single bounded real
      var theta = makeAdaptorNet([{dim:[1], dom:[0,1]}],'Bernoulli').eval(vec)
      //FIXME: deal with domain re-scaling to [0,1]
      return [BernoulliERP, theta]
    } else if(ERPtype == 'Gaussian') {
      //importance ERP is mixture of Gaussians, params are means and logvars for the components
      var ncomponents = 2
      var meansAndLogVars = makeAdaptorNet([[ncomponents],[ncomponents]],'GMM').eval(vec)
      return [GaussianMixtureERP, meansAndLogVars]
    } else if(ERPtype == 'Dirichlet') {
      //importance ERP is??
    }
  //otherwise throw an error....
}

//This function creates an adaptor network that goes from the fixed-size predict vector to whatever size and shape are needed in the importance ERPs... if domains are provided on the return tensors then a rescaling function is applied.
//sizes is an array of tensor shapes. if a shape is an array it is assumed to be the tensor dims and the domain unbounded; if it is an object, it is assumed to have fields for dim and domain bounds.
//eg. [{dim:[1],dom:[0,Infinity]}, [2,2]] means ERP params will be a singleton tensor scaled to positive reals and an unbounded 2x2 matrix tensor.
//name arg is just there so that different ERPs with same shape params can get different adaptors.
//NOTE: this assumes params to importance ERPs are always tensor...
var makeAdaptorNet = cache(function(sizes,name) {
  var nets = []
  for(size in sizes) {
    var dim = (sizes.dim==null)?sizes:sizes.dim
    var flatlength = size.cumProd() //TODO: cumProd
    var mlp = nn.mlp(latentSize, [ {nOut: flatlength} ])
    if(sizes.dom != null){
      //TODO: rescaling to enforce domain bounds
      mlp = nn.seq([mlp,squishnet])
    }
    var net = nn.seq([mlp, nn.reshape([flatlength],size)]) //TODO: reshape?
    net.setTraining(true)
    nets.push(net)
  }
  return nets
})


/*
A future, more flexible version of generateImportanceERP could take an ERPtype which is an object describing the signature of the return value from the original ERP. Some type signatures:
{type: 'Boolean'}
{type: 'Real', domain: [min, max]}
Also probably want to support Tensor, Simplex, ...?

Eventually need to get consistent with new ERP/sample interface. once ERPs are distributions (that don't directly take params) the return value here can just be the importance ERP, with params already taken into account.
*/


module.exports = {
  val2vec: val2vec,
  vec2importanceERP: vec2importanceERP
}
