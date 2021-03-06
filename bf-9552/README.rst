BF-9552
=======

Use-after-free in ``mongod`` when reloading view catalog on secondary. Fixed by SERVER-35929_.

.. _SERVER-35929: https://jira.mongodb.org/browse/SERVER-35929

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 6ed473ed3a122bebc1e932c946fe1c991dbd7ecb
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-9552/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                         \
        -j$(( $(nproc) / 3 ))                               \
        --repeatTests=1000                                  \
        --continueOnFailure                                 \
        --log=file                                          \
        --reportFile=report.json                            \
        --rr=chaos                                          \
        --suite=concurrency_replication_causal_consistency  \
        jstests/concurrency/fsm_workloads/view_catalog_cycle_lookup.js

Results
-------

The 1000 runs were manually interrupted due the replica set not making forward progress after the
``mongod`` process had aborted. This is a direct result of the ``forceSyncSourceCandidate``
failpoint preventing the secondaries later in the linear chain from choosing another sync source.

* 5 / 563 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        20G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* Didn't attempt with ``--rr=off``
