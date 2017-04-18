.. highlight:: none

Persistence
===========

The file store provides a simple way to persist :ref:`parameters
<parameters>` across executions. Parameters are read from a file
before the program is executed, and written back to the file once the
program finishes. Enable it like so::

  webppl model.wppl --param-store file --param-id my-parameters

The file used takes its name from the ``param-id`` command line
argument (appended with ``.json``) and is expected to be located in
the current directory. A new file will be created if this file does
not already exist.

An alternative directory can be specified using the
``WEBPPL_PARAM_PATH`` environment variable.

A random file name is generated when the ``param-id`` argument is
omitted.

Parameters are also periodically written to the file during
:ref:`optimization <optimization>`. The frequency of writes can be
controlled using the ``WEBPPL_PARAM_INTERVAL`` environment variable.
This specifies the minimum amount of time (in milliseconds) that
should elapse between writes. The default is 10 seconds.

Note that this is not intended for parallel use. The :ref:`mongo store
<async>` should be used for this instead.
