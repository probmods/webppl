.. _async:

Parallelization
===============

Sharing parameters across processes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

By default, parameters are stored in-memory and don't persist across executions.

As an alternative, WebPPL supports sharing parameters between WebPPL processes using MongoDB. This can be used to persist parameters across runs, speed up optimization by running multiple identical processes in parallel, and optimize multiple objectives simultaneously.

To use the MongoDB store, select it at startup time as follows::

   webppl model.wppl --param-store mongo

Parameters are associated with a *parameter set id* and sharing only takes place between executions that use the same id. To control sharing, you can specify a particular id using the ``param-id`` command-line argument::

   webppl model.wppl --param-store mongo --param-id my-parameter-set

To use the MongoDB store, MongoDB must be running. By default, WebPPL will look for MongoDB at ``localhost:27017`` and use the collection ``parameters``. This can be changed by adjusting the environment variables ``WEBPPL_MONGO_URL`` and ``WEBPPL_MONGO_COLLECTION``.

Running multiple identical processes in parallel
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To simplify launching multiple identical processes with shared parameters, WebPPL provides a ``parallelRun`` script in the ``scripts`` folder. For example, to run ten processes that all execute ``model.wppl`` with parameter set id ``my-parameter-set``, run::

   scripts/parallelRun model.wppl 10 my-parameter-set

Any extra arguments are passed on to WebPPL, so this works::

   scripts/parallelRun model.wppl 10 my-parameter-set --require webppl-json

For a few initial results on the use of parallel parameter updates for LDA, see `this presentation <https://gist.github.com/stuhlmueller/8ab174bfa441e797a5d1c65e5ce5dcc5>`_.