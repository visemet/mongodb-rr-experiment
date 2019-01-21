BF-7588
=======

Test assertion failure due to not waiting for majority write to replicate to non-voting secondary.
Fixed by SERVER-32774_; however, SERVER-38120_ indicates there is still an issue even after making
the secondaries voting members of the replica set.

.. _SERVER-32774: https://jira.mongodb.org/browse/SERVER-32774
.. _SERVER-38120: https://jira.mongodb.org/browse/SERVER-38120

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout d729fe3fc6c43abd35e517aa2c796c491983329a
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-7588/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-7588/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch
    git am ../bf-7588/patches/0003-Remove-wait-for-config.sessions-collection-creation.patch
    git checkout d729fe3fc6c43abd35e517aa2c796c491983329a --                  \
        buildscripts/resmokeconfig/suites/change_streams_secondary_reads.yml  \
        jstests/change_streams/change_stream_ban_from_views.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py             \
        -j$(( $(nproc) / 3 ))                   \
        --repeatTests=1000                      \
        --continueOnFailure                     \
        --log=file                              \
        --reportFile=report.json                \
        --rr=chaos                              \
        --suite=change_streams_secondary_reads  \
        jstests/change_streams/change_stream_ban_from_views.js

Results
-------

* 193 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        2.6G	/home/ubuntu/.local/share/rr

* 96 / 1000 when using ``--rr=record``

* 54 / 1000 when using ``--rr=off``
