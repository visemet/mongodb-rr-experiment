BF-8424
=======

Invalid memory access in ``mongod`` when running concurrent fuzzer.

Setup
-----

The reason we're building with ``clang`` instead of ``gcc`` here is to avoid the mongo shell
consistently segfaulting during garbage collection when run under ``rr``.

.. code-block:: sh

    cd mongo
    git checkout 0ebab66992c4bd382b1a0acb90549b3d161f3791
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        CC=clang                      \
        CXX=clang++                   \
        mongo mongod

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-8424/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-8424/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py  \
        -j$(( $(nproc) / 2 ))        \
        --repeatTests=1000           \
        --continueOnFailure          \
        --log=file                   \
        --reportFile=report.json     \
        --rr=chaos                   \
        --suite=jstestfuzz           \
        --numClientsPerFixture=10    \
        ../bf-8424/3c79-mdb_0eba-ent_b8ac-qa_a6ce-1521141161647-72.js

Results
-------

The 1000 runs were interrupted due to ``resmoke.py`` halting test execution after the ``mongod``
process had segfaulted.

* 1 / 232 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        2.9G	/home/ubuntu/.local/share/rr

* 1 / 973 when using ``--rr=record``

* 0 / 1000 when using ``--rr=off``
