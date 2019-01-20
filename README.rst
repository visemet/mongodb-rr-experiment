mongodb-rr-experiment
=====================

Over the years, we at MongoDB have developed tooling within our correctness testing infrastructure
to make it easier to debug crashes (by collecting core dumps), hangs (by collecting thread stacks
and lock requests), and data corruption (by collecting data files). However, we have yet to evolve a
better strategy around debugging race conditions and still depend on an engineer to run the failed
test many times with additional logging, or to have them think really hard about where in the code
to add a sleep. Technologies such as rr may help us form a better story for investigating
race-related issues without requiring effort from an engineer to manually reproduce the failure.

Setup
-----

.. code-block:: sh

    git clone https://github.com/visemet/mongodb-rr-experiment.git
    cd mongodb-rr-experiment

Building rr
```````````

The following instructions were adapted from https://github.com/mozilla/rr/wiki/Building-And-Installing.

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
