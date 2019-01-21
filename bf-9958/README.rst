BF-9958
=======

Invariant failure in ``mongoebench``. Fixed by SERVER-37156_.

.. _SERVER-37156: https://jira.mongodb.org/browse/SERVER-37156

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 9184a03574c398b087b929fda8ed428f0c64d28c
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        --mobile-se=on                \
        mongo mongod mongoebench

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-9958/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git checkout 9184a03574c398b087b929fda8ed428f0c64d28c -- jstests/noPassthrough/mongoebench_test.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(( $(nproc) / 2 ))        \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=no_passthrough       \
        --storageEngine=mobile       \
        jstests/noPassthrough/mongoebench_test.js

Results
-------

* 71 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        2.6G	/home/ubuntu/.local/share/rr

* 2 / 1000 when using ``--rr=record``

* 0 / 1000 when using ``--rr=off``
