BF-9030
=======

Collection validation failure due to multikey bit not being set for an index.

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 4aeb61bd31fc934db54c88fec256b71688de4c62
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-9030/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-9030/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch
    git am ../bf-9030/patches/0003-Remove-disableLogicalSessionCacheRefresh-server-para.patch
    git rm -r jstests/                                                              \
        ':!jstests/libs/override_methods/check_uuids_consistent_across_cluster.js'  \
        ':!jstests/libs/override_methods/validate_collections_on_shutdown.js'       \
        ':!jstests/libs/command_sequence_with_retries.js'
    git checkout 4aeb61bd31fc934db54c88fec256b71688de4c62 -- jstests/
    git commit -m 'Use version of tests from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(( $(nproc) / 2 ))        \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=parallel             \
        jstests/parallel/basic.js
