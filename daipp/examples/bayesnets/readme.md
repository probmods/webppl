# Bayes Net examples

This directory contains a number of examples of simple bayes nets, intended to let us explore different aspects of the daipp system.

Some dimensions explored are:

* With model learning (random choices before the mapData) vs without.
* With only continuous distributions vs discrete.
* With fixed set of observed variables vs a set that varies from one observation to the next.


## simplestBN.wppl

This is a net with two continuous latent variables and one observation. The posterior on the latents should be correlated conditioned on the observed.
