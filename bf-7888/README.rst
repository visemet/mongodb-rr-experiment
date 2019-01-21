BF-7888
=======

Test assertion failure due to majority read on oplog reading at oplog visibility. Fixed by
SERVER-33743_.

.. _SERVER-33743: https://jira.mongodb.org/browse/SERVER-33743

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 0a2513f83d0fb43bec41afd76cb4d2e461e76015
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-7888/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-7888/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch
    git am ../bf-7888/patches/0003-Remove-wait-for-config.sessions-collection-creation.patch
    git checkout 0a2513f83d0fb43bec41afd76cb4d2e461e76015 --                                  \
        buildscripts/resmokeconfig/suites/change_streams_sharded_collections_passthrough.yml  \
        jstests/change_streams/change_stream_shell_helper.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                             \
        -j$(( $(nproc) / 3 ))                                   \
        --repeatTests=1000                                      \
        --continueOnFailure                                     \
        --log=file                                              \
        --reportFile=report.json                                \
        --rr=chaos                                              \
        --suite=change_streams_sharded_collections_passthrough  \
        jstests/change_streams/change_stream_shell_helper.js

Results
-------

* 0 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        3.0G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* Didn't attempt with ``--rr=off``
