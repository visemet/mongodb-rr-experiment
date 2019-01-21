BF-10729
========

Invalid memory access in ``mongod`` during stepdown. Fixed by revert of SERVER-35870_.

.. _SERVER-35870: https://jira.mongodb.org/browse/SERVER-35870

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 0d6364ec0a8db3192fc7046ad4ef3c2d5983662a
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-10729/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                  \
        -j$(( $(nproc) / 3 ))                        \
        --repeatTests=1000                           \
        --continueOnFailure                          \
        --log=file                                   \
        --reportFile=report.json                     \
        --rr=chaos                                   \
        --suite=sharding_continuous_config_stepdown  \
        jstests/sharding/kill_pinned_cursor.js
