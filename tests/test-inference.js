'use strict';

var _ = require('lodash');
var seedrandom = require('seedrandom');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var helpers = require('./helpers/helpers');

var testDataDir = './tests/test-data/stochastic/';

var tests = [
  {
    name: 'ForwardSample',
    method: 'forward',
    settings: {
      args: { samples: 3000 },
      hist: { tol: 0.05 },
      mean: { tol: 0.2 },
      std: { tol: 0.2 }
    },
    models: {
      deterministic: { args: { samples: 10 }, hist: { tol: 0 } },
      flips: true,
      geometric: true,
      randomInteger: true,
      gaussian: { args: { samples: 10000 } },
      uniform: { args: { samples: 10000 } },
      uniformSampledSupport: true,
      beta: true,
      exponential: true,
      laplace: { args: { samples: 10000 } },
      tensorLaplace: { args: { samples: 10000 } },
      binomial: true,
      multinomial: true,
      poisson: true,
      cauchy: true,
      logNormal: { args: { samples: 10000 } },
      delta: { args: { samples: 10 }, hist: { exact: true } },
      discreteArr: true,
      discreteVec: true,
      categoricalArr: true,
      categoricalVec: true,
      dirichlet: true,
      multivariateGaussian: true,
      multivariateGaussian2: true,
      multivariateBernoulli: true,
      diagCovGaussian: true,
      tensorGaussian: true,
      mixed1: true,
      mixed2: true,
      mixed3: true,
      mixed4: true,
      bivariateGaussian: true,
      indirectDependency: true,
      guidedFlip: true,
      onlyMAP: {
        mean: { tol: 0.1 },
        std: { tol: 0 },
        args: { samples: 150, onlyMAP: true }
      }
    }
  },
  {
    name: 'Enumerate',
    method: 'enumerate',
    settings: {
      args: {},
      MAP: { check: true }
    },
    models: {
      simple: true,
      simpleSoft: true,
      upweight: true,
      incrementalBinomial: true,
      deterministic: { hist: { exact: true } },
      store: { hist: { exact: true } },
      geometric: { args: { maxExecutions: 10 } },
      binomial2: true,
      delta: { hist: { exact: true } },
      discreteArr: true,
      discreteVec: true,
      categoricalArr: true,
      categoricalVec: true,
      multinomial2: true,
      randomInteger2: true,
      cache: true,
      withCaching: true,
      earlyExit: { hist: { exact: true } },
      zeroProb: { hist: { exact: true } },
      nestedEnumDiscrete: true,
      multivariateBernoulli: true,
      guidedFlip: true,
      mapData: true,
      mem: true
    }
  },
  {
    name: 'IncrementalMH',
    method: 'incrementalMH',
    settings: {
      args: { samples: 5000 },
      hist: { tol: 0.1 }
      //MAP: { tol: 0.15, check: true }
    },
    models: {
      simple: true,
      deterministic: { hist: { tol: 0 }, args: { samples: 100 } },
      cache: true,
      store: { hist: { tol: 0 }, args: { samples: 100 } },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { samples: 100000 } },
      gaussianDrift: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 },
        args: { samples: 80000, burn: 20000 }
      },
      uniformDrift: {
        mean: { tol: 0.4 },
        std: { tol: 0.4 },
        args: { samples: 200000 }
      },
      withCaching: true,
      variableSupport: true,
      query: true,
      query2: { hist: { tol: 0.1, exactSupport: true } },
      onlyMAP: {
        mean: { tol: 0.1 },
        std: { tol: 0 },
        args: { samples: 150, onlyMAP: true }
      },
      nestedEnum1: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum2: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum3: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum6: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum7: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum8: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnumWithFactor: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      guidedFlip: true,
      mapData: true
    }
  },
  {
    name: 'PMCMC',
    settings: {
      args: { particles: 1000, sweeps: 5 },
      hist: { tol: 0.1 },
      MAP: { tol: 0.15, check: true }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { particles: 30, sweeps: 30 } },
      store: { hist: { tol: 0 }, args: { particles: 30, sweeps: 30 } },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 1000, sweeps: 100 } },
      withCaching: true
    }
  },
  {
    name: 'AsyncPF',
    method: 'asyncPF',
    settings: {
      args: { particles: 1000, bufferSize: 1000 },
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.15, check: true }
    },
    models: {
      simple: true,
      store: { hist: { tol: 0 }, args: { particles: 100, bufferSize: 100 } },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 10000, bufferSize: 1000 } },
      withCaching: true
    }
  },
  {
    name: 'Rejection',
    method: 'rejection',
    settings: {
      args: { samples: 1000 },
      hist: { tol: 0.1 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 } },
      upweight: { args: { samples: 1000, maxScore: 10 } },
      incrementalBinomial: { args: { samples: 1000, maxScore: -2 } },
      store: { hist: { tol: 0 } },
      geometric: true,
      varFactors1: true,
      varFactors2: true,
      withCaching: true,
      nestedEnum1: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum2: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum3: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum6: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum7: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum8: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnumDiscrete: true,
      nestedEnumWithFactor: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      guidedFlip: true,
      mapData: true
    }
  },
  {
    name: 'IncrementalRejection',
    method: 'rejection',
    settings: {
      args: { samples: 1000, incremental: true },
      hist: { tol: 0.1 }
    },
    models: {
      simple: true,
      cache: true,
      incrementalBinomial: { args: { samples: 1000, maxScore: -2, incremental: true } },
      store: { hist: { tol: 0 } },
      geometric: true,
      varFactors2: true
    }
  },
  {
    name: 'ParticleFilter',
    method: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.15, check: true },
      args: { particles: 1000 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { particles: 100 } },
      store: { hist: { tol: 0 }, args: { particles: 100 } },
      store2: { hist: { tol: 0 }, args: { particles: 100 } },
      notapes: { hist: { tol: 0 }, args: { particles: 100 } },
      onlyMAP: {
        mean: { tol: 0.1 },
        std: { tol: 0 },
        args: { particles: 150, onlyMAP: true }
      },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 10000 } },
      varFactors1: { args: { particles: 5000 } },
      varFactors2: true,
      importance: true,
      importance2: { args: { particles: 3000 } },
      importance3: true,
      withCaching: true,
      nestedEnum1: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum2: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum3: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum6: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum7: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnum8: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      nestedEnumWithFactor: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      guideThunks: {
        hist: { exact: true },
        args: { particles: 100 }
      },
      noGuideThunks: {
        hist: { exact: true },
        args: { particles: 100, importance: 'ignoreGuide' }
      },
      guidedFlip: true,
      mapData: true
    }
  },
  {
    name: 'ParticleFilterRejuvMH',
    method: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.15, check: true },
      args: { particles: 1000, rejuvSteps: 10 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { particles: 30, rejuvSteps: 30 } },
      store: { hist: { tol: 0 }, args: { particles: 30, rejuvSteps: 30 } },
      store2: { hist: { tol: 0 }, args: { particles: 30, rejuvSteps: 30 } },
      notapes: { hist: { tol: 0 }, args: { particles: 100 } },
      geometric: true,
      gaussianDrift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 1000, rejuvSteps: 15 } },
      uniformDrift: { mean: { tol: 0.5 }, std: { tol: 0.4 }, args: { particles: 1000, rejuvSteps: 15 } },
      varFactors1: true,
      varFactors2: true,
      importance: true,
      importance2: { args: { particles: 3000, rejuvSteps: 10 } },
      importance3: true,
      withCaching: true,
      variableSupport: true,
      nestedEnumWithFactor: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      guidedFlip: true
    }
  },
  {
    name: 'ParticleFilterRejuvHMC',
    method: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      mean: { tol: 0.2 },
      std: { tol: 0.2 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.15, check: true },
      args: { particles: 1000, rejuvSteps: 10, rejuvKernel: 'HMC' }
    },
    models: {
      simple: true,
      deterministic: { hist: { tol: 0 } },
      store: { hist: { tol: 0 } },
      store2: { hist: { tol: 0 } },
      gaussianDrift: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 }
      },
      uniformDrift: {
        mean: { tol: 0.5 },
        std: { tol: 0.4 }
      },
      nestedEnumWithFactor: { mean: { tol: 0.075 }, std: { tol: 0.05 } },
      gaussianMean: { args: { particles: 1000, rejuvSteps: 2, rejuvKernel: 'HMC' } },
      gaussianMeanVar: { args: { particles: 1000, rejuvSteps: 2, rejuvKernel: 'HMC' } },
      guidedFlip: true,
      uniformSampledSupport: true
    }
  },
  {
    name: 'ParticleFilterAsMH',
    method: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.15, check: true },
      args: { particles: 1, rejuvSteps: 10000, rejuvKernel: { MH: { permissive: true } } }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: {
        hist: { tol: 0 },
        args: { particles: 1, rejuvSteps: 100, rejuvKernel: { MH: { permissive: true } } }
      },
      store: {
        hist: { tol: 0 },
        args: { particles: 1, rejuvSteps: 100, rejuvKernel: { MH: { permissive: true } } }
      },
      store2: {
        hist: { tol: 0 },
        args: { particles: 1, rejuvSteps: 100, rejuvKernel: { MH: { permissive: true } } }
      },
      geometric: true,
      importance: true,
      importance2: true,
      importance3: true,
      variableSupport: true
    }
  },
  {
    name: 'MH',
    method: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.15, check: true },
      args: { samples: 5000 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { samples: 100 } },
      store: { hist: { tol: 0 }, args: { samples: 100 } },
      notapes: { hist: { tol: 0 }, args: { samples: 100 } },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { samples: 80000, burn: 20000 } },
      gaussianDrift: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 },
        args: { samples: 80000, burn: 20000 }
      },
      uniformDrift: {
        mean: { tol: 0.5 },
        std: { tol: 0.4 },
        args: { samples: 200000, burn: 1 }
      },
      funnyDrift: true,
      withCaching: true,
      variableSupport: true,
      query: true,
      query2: { hist: { tol: 0.1, exactSupport: true } },
      onlyMAP: {
        mean: { tol: 0.1 },
        std: { tol: 0 },
        args: { samples: 150, onlyMAP: true }
      },
      nestedEnum1: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum2: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum3: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum6: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum7: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnum8: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      nestedEnumWithFactor: { mean: { tol: 0.1 }, std: { tol: 0.075 } },
      guidedFlip: true,
      mapData: true,
      mem: true
    }
  },
  {
    name: 'HMC',
    method: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      mean: { tol: 0.2 },
      std: { tol: 0.2 },
      MAP: { tol: 0.15, check: true },
      args: { samples: 5000, kernel: 'HMC' }
    },
    models: {
      deterministic: { hist: { tol: 0 }, args: { samples: 100, kernel: 'HMC' } },
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: { samples: 100, kernel: 'HMC' } },
      store2: { hist: { tol: 0 }, args: { samples: 100, kernel: 'HMC' } },
      geometric: true,
      withCaching: true,
      variableSupport: true,
      query: true,
      query2: { hist: { tol: 0.1, exactSupport: true } },
      onlyMAP: {
        mean: { tol: 0.1 },
        std: { tol: 0 },
        args: { samples: 150, kernel: 'HMC', onlyMAP: true }
      },
      mixed1: true,
      mixed1Factor: true,
      mixed2: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      mixed2Factor: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      mixed3: {
        hist: { tol: 0.15 },
        args: {
          samples: 2000,
          kernel: { HMC: { steps: 20, stepSize: 1 } }
        }
      },
      mixed3Factor: {
        hist: { tol: 0.15 },
        args: {
          samples: 2000,
          kernel: { HMC: { steps: 20, stepSize: 1 } }
        }
      },
      mixed4: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      mixed4Factor: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      tensorGaussian: true,
      diagCovGaussian: {
        args: {
          samples: 10000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      gaussianMean: true,
      mvGaussianMean: true,
      gaussianMeanVar: {
        args: {
          samples: 1000,
          burn: 10,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      bivariateGaussian: {
        args: {
          samples: 1000,
          burn: 10,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      bivariateGaussianFactor: {
        args: {
          samples: 2000,
          burn: 10,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      indirectDependency: {
        args: {
          samples: 1000,
          burn: 100,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      constrainedSum: {
        hist: { tol: 0.1 },
        args: {
          samples: 700,
          burn: 50,
          kernel: { HMC: { steps: 50, stepSize: 0.004 } }
        }
      },
      nestedEnum1: { mean: { tol: 0.075 }, std: { tol: 0.075 } },
      nestedEnum2: { mean: { tol: 0.075 }, std: { tol: 0.075 } },
      nestedEnum3: { mean: { tol: 0.075 }, std: { tol: 0.075 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.085 }, std: { tol: 0.075 } },
      nestedEnum6: { mean: { tol: 0.075 }, std: { tol: 0.075 } },
      nestedEnum7: { mean: { tol: 0.075 }, std: { tol: 0.075 } },
      nestedEnum8: {
        mean: { tol: 0.075 },
        std: { tol: 0.075 },
        args: {
          samples: 2000,
          kernel: { HMC: { steps: 20, stepSize: 0.2 } }
        }
      },
      nestedEnumWithFactor: {
        mean: { tol: 0.075 },
        std: { tol: 0.075 },
        args: {
          samples: 1500,
          burn: 1500,
          kernel: { HMC: { steps: 50, stepSize: 0.01 }}
        }
      },
      guidedGaussian: {
        args: {
          samples: 5000,
          burn: 100
        }
      },
      uniformSampledSupport: true
    }
  },
  {
    name: 'HMConly',
    method: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      mean: { tol: 0.3 },
      std: { tol: 0.3 },
      args: { samples: 1000, kernel: 'HMConly' }
    },
    models: {
      deterministic: { hist: { tol: 0 } },
      gaussianMean: true
    }
  },
  {
    name: 'OptimizeELBO',
    method: 'optimize',
    settings: {
      args: {
        samples: 5000,
        steps: 100,
        optMethod: 'gd',
        estimator: { ELBO: { samples: 120 } }
      },
      hist: { tol: 0.1 },
      mean: { tol: 0.1 },
      std: { tol: 0.1 }
    },
    models: {
      simpleSoft: true,
      deterministic: true,
      store2: {
        hist: { exact: true },
        args: { checkGradients: false }
      },
      withCaching: true,
      guideThunks: { hist: { exact: true } },
      gaussianMean: true,
      guidedFlip: true,
      guidedGaussian: {
        mean: { tol: 0.2 },
        std: { tol: 0.2 },
        args: {
          samples: 5000,
          steps: 10000
        }
      },
      guidedUniform: {
        args: {
          samples: 10000,
          steps: 10000
        }
      },
      guidedGamma: {
        args: {
          samples: 10000,
          steps: 10000
        }
      },
      guidedBeta: {
        args: {
          samples: 10000,
          steps: 10000
        }
      },
      dirichlet: {
        args: {
          samples: 5000,
          steps: 1000,
          optMethod: 'gd',
          estimator: { ELBO: { samples: 1 } }
        }
      },
      tensorGaussian: {
        mean: { tol: 0.15 },
        args: {
          samples: 5000,
          steps: 10000
        }
      },
      multivariateGaussian2: {
        mean: { tol: 0.2 },
        std: { tol: 0.2 },
        args: {
          optMethod: { adam: { stepSize: 0.001 } },
          samples: 10000,
          steps: 10000
        }
      },
      tensorLaplace: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 },
        args: {
          optMethod: {adam: {stepSize: 0.002}},
          samples: 10000,
          steps: 20000
        }
      },
      laplace: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 },
        args: {
          optMethod: {adam: {stepSize: 0.001}},
          samples: 10000,
          steps: 40000
        }
      },
      exponential: {
        args: {
          samples: 10000,
          steps: 10000
        }
      },
      cauchy: {
        args: {
          samples: 10000,
          steps: 10000
        }
      },
      logNormal: {
        args: {
          samples: 10000,
          steps: 10000
        }
      },
      randomInteger2: {
        args: {
          samples: 1000,
          steps: 1000,
          optMethod: {adam: {stepSize: 0.1}}
        }
      },
      binomial2: {
        args: {
          samples: 1000,
          steps: 1000,
          optMethod: {adam: {stepSize: 0.1}}
        }
      },
      mapData: true,
      mapData2: {
        mean: { tol: 2 },
        args: {
          samples: 1,
          steps: 10000,
          optMethod: { adam: { stepSize: 0.01 } },
          estimator: { ELBO: { avgBaselines: false } }
        }
      },
      onlyMAP: {
        mean: { tol: 0.1 },
        std: { tol: 0 },
        args: {
          steps: 10000,
          samples: 150,
          onlyMAP: true
        }
      },
      enumGuide: {
        args: {
          steps: 6000,
          samples: 10000
        }
      },
      weightDecayL2: {
        mean: { tol: 0.01 },
        args: {
          samples: 1,
          steps: 1000,
          optMethod: { adam: { stepSize: 0.1 } },
          weightDecay: { l2: { strength: 1 } }
        }
      },
      nn: {
        mean: { tol: 0.6 },
        args: {
          samples: 1,
          steps: 1000,
          optMethod: { adam: { stepSize: 0.01 } }
        }
      }
    }
  },
  {
    name: 'OptimizeDream',
    method: 'optimize',
    settings: {
      args: {
        samples: 10000,
        steps: 10000,
        optMethod: {adam: {stepSize: 0.01}},
        estimator: 'dream'
      },
      hist: { tol: 0.1 },
      mean: { tol: 0.1 },
      std: { tol: 0.1 }
    },
    models: {
      deterministic: { hist: { exact: true } },
      withCaching: true,
      dream1: true,
      dream2: true,
      dream3: true
    }
  },
  {
    name: 'AIS',
    settings: {
      args: {
        steps: 500,
        samples: 100
      },
      logZ: {check: true, tol: 0.05}
    },
    models: {
      partition1: {logZ: {check: true, tol: 1e-6}},
      partition2: true,
      partition3: true
    }
  }
];

var wpplRunInference = function(modelName, testDef) {
  var inferenceArgs = getInferenceArgs(testDef, modelName);
  var progText = [
    helpers.loadModel(testDataDir, modelName),
    'Infer(', inferenceArgs, ', model);'
  ].join('');
  try {
    var retVal;
    webppl.run(progText, function(store, dist) { retVal = { store: store, dist: dist }; });
    return retVal;
  } catch (e) {
    console.log('Exception: ' + e);
    throw e;
  }
};

var performTest = function(modelName, testDef, test) {
  var result = wpplRunInference(modelName, testDef);
  var expectedResults = helpers.loadExpected(testDataDir, modelName);

  _.each(expectedResults, function(expected, testName) {
    // The tests to run for a particular model are determined by the contents
    // of the expected results JSON file.
    assert(testFunctions[testName], 'Unexpected key "' + testName + '"');
    var testArgs = _.assign.apply(null, _.filter([
      { tol: 0.0001 }, // Defaults.
      testDef.settings[testName],
      testDef.models[modelName] && testDef.models[modelName][testName] // Most specific.
    ]));
    testFunctions[testName](test, result, expected, testArgs);
  });

  test.done();
};

var getInferenceArgs = function(testDef, model) {
  var args = (testDef.models[model] && testDef.models[model].args) || testDef.settings.args;
  return util.serialize(_.assign({}, args, {method: testDef.method || testDef.name}));
};

var testFunctions = {
  hist: function(test, result, expected, args) {
    var eq = args.exact ? _.isEqual : util.histsApproximatelyEqual;
    var actual = _.mapValues(result.dist.getDist(), function(obj) { return obj.prob; });
    var msg = ['Expected hist: ', util.serialize(expected),
               ', actual: ', util.serialize(actual)].join('');
    test.ok(eq(actual, expected, args.tol, args.exactSupport), msg);
  },
  mean: function(test, result, expected, args) {
    helpers.testWithinTolerance(test, util.histExpectation(result.dist.getDist()), expected, args.tol, 'mean');
  },
  std: function(test, result, expected, args) {
    helpers.testWithinTolerance(test, util.histStd(result.dist.getDist()), expected, args.tol, 'std');
  },
  logZ: function(test, result, expected, args) {
    if (args.check) {
      helpers.testWithinTolerance(test, result.dist.normalizationConstant, expected, args.tol, 'logZ');
    }
  },
  MAP: function(test, result, expected, args) {
    if (args.check) {
      var map = result.dist.MAP();
      helpers.testEqual(test, map.val, expected.val, 'MAP value');
      helpers.testWithinTolerance(test, map.score, expected.score, args.tol, 'MAP score');
    }
  },
  store: function(test, result, expected, args) {
    helpers.testEqual(test, result.store, expected, 'store');
  }
};

var generateTestCases = function(seed) {
  _.each(tests, function(testDef) {
    exports[testDef.name] = {};
    _.each(_.keys(testDef.models), function(modelName) {
      exports[testDef.name][modelName] = _.partial(performTest, modelName, testDef);
    });
  });
  var oldSuppressWarnings;
  exports.setUp = function(callback) {
    oldSuppressWarnings = global.suppressWarnings;
    global.suppressWarnings = true;
    util.seedRNG(seed);
    callback();
  };
  exports.tearDown = function(callback) {
    global.suppressWarnings = oldSuppressWarnings;
    util.resetRNG();
    callback();
  };
};

var seed = helpers.getRandomSeedFromEnv() || Math.abs(seedrandom().int32());
console.log('Random seed: ' + seed);
generateTestCases(seed);
