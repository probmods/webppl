WebPPL [![Build Status](https://travis-ci.org/probmods/webppl.svg?branch=dev)](https://travis-ci.org/probmods/webppl) [![Dependency Status](https://david-dm.org/probmods/webppl.svg)](https://david-dm.org/probmods/webppl)
======

Probabilistic programming for the web

## Quick start

Install using [nodejs](http://nodejs.org):

    npm install -g webppl

Run WebPPL programs:

    webppl myprogram.wppl

Upgrade WebPPL:

    npm update -g webppl
## Using packages with WebPPL
To use packages, first navigate to your home directory and create a folder named ```.webppl```. This is where WebPPL programs will find packages.

To install a package, run ```npm install --prefix ~/.webppl myPackage```, where myPackage is the name of the package you would like to use. 

To run a WebPPL program with a package, run the following command:

```webppl --require *PackageName* *FileName*.wppl```

For each additional package, a require statement is needed. For example, using the packages webppl-csv and webppl-viz requires the following command:

```webppl --require webppl-csv --require webppl-viz *FileName*.wppl```

## Documentation

Read our docs at [docs.webppl.org](http://docs.webppl.org/).

## License

WebPPL is released under the [MIT License](LICENSE.md).

## Contributions

We encourage you to contribute to WebPPL! Check out our [guidelines for contributors](CONTRIBUTING.md) and join the [webppl-dev](https://groups.google.com/forum/#!forum/webppl-dev) mailing list.
