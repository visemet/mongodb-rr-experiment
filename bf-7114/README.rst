BF-7114
=======

Test assertion failure due to race around tailable, await-data cursors in ``mongos``. Fixed by
SERVER-30834_.

.. _SERVER-30834: https://jira.mongodb.org/browse/SERVER-30834

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout f19da233faba9a42b7fbe84b38df7bb7f1a9e496
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-7114/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-7114/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch
    git am ../bf-7114/patches/0003-Remove-wait-for-config.sessions-collection-creation.patch
    git checkout f19da233faba9a42b7fbe84b38df7bb7f1a9e496 --                     \
        buildscripts/resmokeconfig/suites/change_streams_mongos_passthrough.yml  \
        jstests/libs/change_stream_util.js                                       \
        jstests/change_streams/change_stream_collation.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                \
        -j$(( $(nproc) / 3 ))                      \
        --repeatTests=1000                         \
        --continueOnFailure                        \
        --log=file                                 \
        --reportFile=report.json                   \
        --rr=chaos                                 \
        --suite=change_streams_mongos_passthrough  \
        jstests/change_streams/change_stream_collation.js

Results
-------

* 0 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        2.3G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* Didn't attempt with ``--rr=off``
