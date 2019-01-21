BF-9426
=======

Invariant in ``mongod`` due to in-memory and on-disk catalogs being out of sync.

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout d814cdd418edb681b922e5d8ebc453d3d774f1ca
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-9426/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git checkout d814cdd418edb681b922e5d8ebc453d3d774f1ca --                \
        buildscripts/resmokelib/testing/hooks/periodic_kill_secondaries.py  \
        jstests/core/geo_group.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                               \
        -j$(( $(nproc) / 2 ))                                     \
        --repeatTests=1000                                        \
        --continueOnFailure                                       \
        --log=file                                                \
        --reportFile=report.json                                  \
        --rr=chaos                                                \
        --suite=replica_sets_kill_secondaries_jscore_passthrough  \
        --storageEngineCacheSizeGB=1                              \
        jstests/core/geo_group.js

Results
-------

* 0 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        17G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* Didn't attempt with ``--rr=off``
