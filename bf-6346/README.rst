BF-6346
=======

Invalid WiredTiger ``configString`` read from metadata cursor. Fixed by SERVER-32823_.

.. _SERVER-32823: https://jira.mongodb.org/browse/SERVER-32823

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout ea31111dc95eb309269545348c34791b472f6c25
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-6346/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-6346/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch
    git am ../bf-6346/patches/0003-Remove-disableLogicalSessionCacheRefresh-server-para.patch

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py         \
        -j$(( $(nproc) / 2 ))               \
        --repeatTests=1000                  \
        --continueOnFailure                 \
        --log=file                          \
        --reportFile=report.json            \
        --rr=chaos                          \
        --suite=no_passthrough_with_mongod  \
        jstests/noPassthroughWithMongod/wt_roundtrip_creation_string.js
