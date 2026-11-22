# ClusterFuzzLite (https://google.github.io/clusterfuzzlite/): the image that builds MaiSim's fuzzers. The base image is
# pinned by digest; MaiSim's code is copied in and fuzz/build.sh builds each fuzz/*_fuzzer.py with atheris.
FROM gcr.io/oss-fuzz-base/base-builder-python@sha256:21f6fab17ace4dc76e1c56de91ee95d3d03da021df94b41056ba036f6c6f55e9
COPY . $SRC/maisim
WORKDIR $SRC/maisim
COPY .clusterfuzzlite/build.sh $SRC/
