BF-9248
=======

Unhandled exception when disposing of an aggregation cursor in a sharded cluster. To be addressed by
SERVER-38064_.

.. _SERVER-38064: https://jira.mongodb.org/browse/SERVER-38064

Setup
-----

The reason we're building with ``clang`` instead of ``gcc`` here is to avoid the mongo shell
consistently segfaulting during garbage collection when run under ``rr``.

.. code-block:: sh

    cd mongo
    git checkout 4cee07d8a97bb0663e7bfbc3f2e1fbf539140adf
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        CC=clang                      \
        CXX=clang++                   \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-8424/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-8424/patches/0002-Remove-data-consistency-checks-from-test-suite.patch

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(( $(nproc) / 3 ))        \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=jstestfuzz_sharded   \
        --numClientsPerFixture=10    \
        ../bf-9248/d01d5-mdb_4cee-ent_7a02-qa_a6ce-1526944867781-48.js
