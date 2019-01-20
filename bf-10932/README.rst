BF-10932
========

Segmentation fault in ``collection_cloner_test``. Fixed by SERVER-37617_.

.. _SERVER-37617: https://jira.mongodb.org/browse/SERVER-37617

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 3af0f2a6053a7385b89149adce16a23b88cf9be7
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        --opt=on                      \
        --dbg=on                      \
        build/unittests/collection_cloner_test

.. code-block:: sh

    git checkout mongodb-rr-experiment
    python2 buildscripts/resmoke.py  \
        -j$(nproc)                   \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=unittests            \
        build/unittests/collection_cloner_test
