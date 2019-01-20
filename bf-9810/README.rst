BF-9810
=======

WiredTiger error when running ``dbtest repl``. To be addressed by WT-3893_.

.. _WT-3893: https://jira.mongodb.org/browse/WT-3893

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout b8f2338752f5ed8ee8da184919b5f43ac0bed3eb
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        --opt=on                      \
        --dbg=on                      \
        dbtest

.. code-block:: sh

    git checkout mongodb-rr-experiment
    git am ../bf-9810/patches/0001-Remove-enableMajorityReadConcern-option-from-dbtest.patch

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(nproc)                   \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=dbtest               \
        repl
