BF-9864
=======

Invariant failure in ``mongod`` during query planning.

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 6966674b8ea1367f71ca47e68db8ad424aefd949
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        mongo mongod mongos

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-9864/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git checkout 6966674b8ea1367f71ca47e68db8ad424aefd949 -- jstests/sharding/recovering_slaveok.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(( $(nproc) / 3 ))        \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=sharding_auth        \
        jstests/sharding/recovering_slaveok.js

Results
-------

The 1000 runs were interrupted due to the machine's 200GB disk becoming full after running for
approximately 40 hours.

* 0 / 687 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        126G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* Didn't attempt with ``--rr=off``
