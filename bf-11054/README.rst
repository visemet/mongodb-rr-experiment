BF-11054
========

Invariant failure in ``mongod`` when running rollback fuzzer. Fixed by SERVER-37443_.

.. _SERVER-37443: https://jira.mongodb.org/browse/SERVER-37443

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 248601a6473fc7364e5d790a357acbace2a42f7a
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongobridge

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(( $(nproc) / 2 ))        \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=rollback_fuzzer      \
        ../bf-11054/rollback_test-656f-1540430041796-00.js
