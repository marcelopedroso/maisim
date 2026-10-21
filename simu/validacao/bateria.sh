#!/usr/bin/env bash
# a bateria inteira na instância de teste (./sobe_teste.sh sobe tudo): o mesmo que o GitHub Actions roda depois de cada
# merge no main — tela, API, offline e o scope ao vivo (instância isolada). Ver ci.sh (rapido | completo | <teste>…).
exec bash "$(cd "$(dirname "$0")" && pwd)/ci.sh" completo
