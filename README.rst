mongodb-rr-experiment
=====================

Over the years, we at MongoDB have developed tooling within our correctness testing infrastructure
to make it easier to debug crashes (by collecting core dumps), hangs (by collecting thread stacks
and lock requests), and data corruption (by collecting data files). However, we have yet to evolve a
better strategy around debugging race conditions and still depend on an engineer to run the failed
test many times with additional logging, or to have them think really hard about where in the code
to add a sleep. Technologies such as ``rr`` may help us form a better story for investigating
race-related issues without requiring effort from an engineer to manually reproduce the failure.

Setup
-----

.. code-block:: sh

    git clone https://github.com/visemet/mongodb-rr-experiment.git
    cd mongodb-rr-experiment

Building ``rr``
```````````````

The following instructions were adapted from
https://github.com/mozilla/rr/wiki/Building-And-Installing.

.. code-block:: sh

    sudo apt update
    sudo apt install     \
        capnproto        \
        ccache           \
        clang            \
        cmake            \
        coreutils        \
        g++-multilib     \
        gdb              \
        git              \
        libcapnp-dev     \
        make             \
        manpages-dev     \
        ninja-build      \
        pkg-config       \
        python-pexpect   \
        python3-pexpect

.. code-block:: sh

    git clone https://github.com/mozilla/rr.git
    cd rr
    git checkout 5.2.0

    CC=clang CXX=clang++ cmake -B build/ -G Ninja -Ddisable32bit=ON .
    cmake --build .

    sudo cmake --build . --target install
    sudo sysctl kernel.perf_event_paranoid=1

Building MongoDB
````````````````

The following instructions were adapted from
https://github.com/mongodb/mongo/wiki/Build-Mongodb-From-Source.

.. code-block:: sh

    sudo apt install libcurl4-openssl-dev python-pip

.. code-block:: sh

    git clone https://github.com/mongodb/mongo.git
    cd mongo

    git remote add visemet https://github.com/visemet/mongo.git
    git fetch visemet mongodb-rr-experiment
    git checkout visemet/mongodb-rr-experiment

    python2 -m pip install -r etc/pip/dev-requirements.txt
    python2 -m pip install --user psutil==5.4.8

Results
-------

You may notice when comparing the columns in the tables below that (1) there weren't any cases where
a failure could only be reproduced using ``rr``, and (2) there were multiple cases where a failure
could only be reproduced manually. This shouldn't be interpreted as saying ``rr`` is ineffective. It
is still very likely that ``rr`` would save an engineer both time and effort when investigating a
build failure. The results simply demonstrate that it isn't possible to solely rely on ``rr`` as the
answer to investigating all race-related issues.

Single-process failures
```````````````````````

+---------------+-------------+-------------+
|               |     Able to reproduce?    |
| Build failure +-------------+-------------+
|               |   using rr  |   manually  |
+===============+=============+=============+
| BF-9810_      |             |             |
+---------------+-------------+-------------+
| BF-9958_      | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-10742_     | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-10932_     | |checkmark| | |checkmark| |
+---------------+-------------+-------------+

.. _BF-9810: bf-9810/README.rst
.. _BF-9958: bf-9958/README.rst
.. _BF-10742: bf-10742/README.rst
.. _BF-10932: bf-10932/README.rst

Single server process failures
``````````````````````````````

+---------------+-------------+-------------+
|               |     Able to reproduce?    |
| Build failure +-------------+-------------+
|               |   using rr  |   manually  |
+===============+=============+=============+
| BF-6346_      |             | |checkmark| |
+---------------+-------------+-------------+
| BF-8424_      | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-9030_      |             |             |
+---------------+-------------+-------------+

.. _BF-6346: bf-6346/README.rst
.. _BF-8424: bf-8424/README.rst
.. _BF-9030: bf-9030/README.rst

Multi server process failures
`````````````````````````````

+---------------+-------------+-------------+
|               |     Able to reproduce?    |
| Build failure +-------------+-------------+
|               |   using rr  |   manually  |
+===============+=============+=============+
| BF-7114_      |             | |checkmark| |
+---------------+-------------+-------------+
| BF-7588_      | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-7888_      |             | |checkmark| |
+---------------+-------------+-------------+
| BF-8258_      |             |             |
+---------------+-------------+-------------+
| BF-8642_      | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-9248_      |             | |checkmark| |
+---------------+-------------+-------------+
| BF-9426_      |             |             |
+---------------+-------------+-------------+
| BF-9552_      | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-9864_      |             |             |
+---------------+-------------+-------------+
| BF-10729_     | |checkmark| | |checkmark| |
+---------------+-------------+-------------+
| BF-11054_     | |checkmark| | |checkmark| |
+---------------+-------------+-------------+

.. _BF-7114: bf-7114/README.rst
.. _BF-7588: bf-7588/README.rst
.. _BF-7888: bf-7888/README.rst
.. _BF-8258: bf-8258/README.rst
.. _BF-8642: bf-8642/README.rst
.. _BF-9248: bf-9248/README.rst
.. _BF-9426: bf-9426/README.rst
.. _BF-9552: bf-9552/README.rst
.. _BF-9864: bf-9864/README.rst
.. _BF-10729: bf-10729/README.rst
.. _BF-11054: bf-11054/README.rst

.. |checkmark| unicode:: U+2713
