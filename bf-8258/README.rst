BF-8258
=======

Invariant failure in ``mongod`` index catalog.

Setup
-----

.. code-block:: sh

    cd mongo
    git checkout 22b2b828a922a7459b4e1c75860a11c7eb3db630
    python2 buildscripts/scons.py     \
        -j$(nproc)                    \
        --disable-warnings-as-errors  \
        --opt=on                      \
        --dbg=on                      \
        mongo mongod

.. code-block:: sh

    git checkout visemet/mongodb-rr-experiment
    git am ../bf-8258/patches/0001-Remove-enableMajorityReadConcern-option-from-mongod.patch
    git am ../bf-8258/patches/0002-Remove-transactionLifetimeLimitSeconds-server-parame.patch
    git show e7c2cbf88bc07549d634613049358214dbbaac4b -- buildscripts/resmokelib/testing/hooks/periodic_kill_secondaries.py | git apply -R
    git show 59f462046d76a7d8e48ec678ad03b489f5fcc56e -- buildscripts/resmokelib/testing/hooks/periodic_kill_secondaries.py | git apply -R
    git add buildscripts/resmokelib/testing/hooks/periodic_kill_secondaries.py
    git checkout 22b2b828a922a7459b4e1c75860a11c7eb3db630 -- jstests/core/queryoptimizer3.js
    git commit -m 'Use version of test from failing commit.'

    rm -rf ~/.local/share/rr/*
    python2 buildscripts/resmoke.py                               \
        -j$(( $(nproc) / 2 ))                                     \
        --repeatTests=1000                                        \
        --continueOnFailure                                       \
        --log=file                                                \
        --reportFile=report.json                                  \
        --rr=chaos                                                \
        --suite=replica_sets_kill_secondaries_jscore_passthrough  \
        --storageEngineCacheSizeGB=1                              \
        jstests/core/queryoptimizer3.js

Results
-------

The 1000 runs were manually interrupted due the test not making forward progress. It isn't clear why
there were executions of the ``queryoptimizer3.js`` test and the ``PeriodicKillSecondaries`` hook
that were running for >30 hours.

* 0 / 636 when using ``--rr=chaos``

  .. code-block:: console

        $ du -hs ~/.local/share/rr
        98G	/home/ubuntu/.local/share/rr

* Didn't attempt with ``--rr=record``

* Didn't attempt with ``--rr=off``
