#!/bin/bash -eu
# builds each fuzz/*_fuzzer.py (atheris, already in the base image); the MaiSim modules come from simu/ and config/
export PYTHONPATH="$SRC/maisim/simu:$SRC/maisim/config"
for f in "$SRC"/maisim/fuzz/*_fuzzer.py; do
  compile_python_fuzzer "$f" --paths "$SRC/maisim/simu" --paths "$SRC/maisim/config"
done
