BF-10742
========

Assertion failure in ``collection_cloner_test``. To be addressed by SERVER-37632_.

.. _SERVER-37632: https://jira.mongodb.org/browse/SERVER-37632

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 180fa35de98c2433d3d6e2a268b52e5734de1a0b
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

Only the manifestations of BF-10742 are counted here. There were manifestations of BF-10932 when
running ``collection_cloner_test``.

* 97 / 1000 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        526M	/home/ubuntu/.local/share/rr

* 0 / 1000 when using ``--rr=record``

* 0 / 1000 when using ``--rr=off``
