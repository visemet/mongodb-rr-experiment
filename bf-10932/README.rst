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
    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(nproc)                   \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=unittests            \
        build/unittests/collection_cloner_test

Results
-------

Only the manifestations of BF-10932 are counted here. There were manifestations of BF-10742 when
running ``collection_cloner_test``.

* 191 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        531M	/home/ubuntu/.local/share/rr

* 0 / 1000 when using ``--rr=record``

* 0 / 1000 when using ``--rr=off``
