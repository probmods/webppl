.. _optimization:

Optimization
============

Optimization provides an alternative approach to :ref:`marginal
inference <inference>`.

In this section we refer to the program for which we would like to
obtain the marginal distribution as the *target program*.

If we take a target program and add a :ref:`guide distribution
<guides>` to each random choice, then we can define the *guide
program* as the program you get when you sample from the guide
distribution at each ``sample`` statement and ignore all ``factor``
statements.

If we endow this guide program with adjustable parameters, then we can
optimize those parameters so as to minimize the distance between the
joint distribution of the choices in the guide program and those in
the target. For example::

   Optimize({
     steps: 10000, 
     model: function() {
       var x = sample(Gaussian({ mu: 0, sigma: 1 }), {
         guide: function() {
           return Gaussian({ mu: param(), sigma: 1 });
         }});
       factor(-(x-2)*(x-2))
       return x;
     }});

This general approach includes a number of well-known algorithms as
special cases.

It is supported in WebPPL by :ref:`a method for performing
optimization <optimize>`, primitives for specifying :ref:`parameters
<parameters>`, and the ability to specify guides.

.. toctree::
   :maxdepth: 2

   optimize
   parameters
   filestore
   async
