BF-8642
=======

Violation of ``$clusterTime >= operationTime`` property when running with causal consistency
enabled. Fixed by SERVER-34843_.

.. _SERVER-34843: https://jira.mongodb.org/browse/SERVER-34843

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 117e1911afaa799071b5e02ce363f793645d5654
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-8642/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-8642/patches/0002-Remove-data-consistency-checks-from-test-suite.patch
    git checkout 117e1911afaa799071b5e02ce363f793645d5654 -- jstests/concurrency/fsm_workloads/reindex.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                     \
        -j$(( $(nproc) / 3 ))                           \
        --repeatTests=1000                              \
        --continueOnFailure                             \
        --log=file                                      \
        --reportFile=report.json                        \
        --rr=chaos                                      \
        --suite=concurrency_sharded_causal_consistency  \
        jstests/concurrency/fsm_workloads/reindex.js

Results
-------

* 3 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        36G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* 0 / 1000 when using ``--rr=off``
