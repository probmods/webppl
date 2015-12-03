#!/bin/sh
set -ex
wget https://s3.amazonaws.com/travis-phantomjs/phantomjs-2.0.0-ubuntu-12.04.tar.bz2
mkdir phantomjs
tar xvf phantomjs-2.0.0-ubuntu-12.04.tar.bz2 -C phantomjs
