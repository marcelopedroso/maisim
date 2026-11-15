#!/usr/bin/env bash
# O teste de fumaça do pacote do Linux montado (pacote/linux/monta.sh), na arquitetura da máquina (o CI: x86_64 e o runner
# ARM): sobe o MaiSim do pacote (o AppRun: o Python, o Java e o Gecko de dentro dele) numa porta e numa pasta descartáveis,
# sem navegador; abre o exemplo do buck e roda; gera um PDF no Figuras com a rodada; roda o controle em C (o TinyCC do
# pacote); para e confere as portas livres.
# Precisa: o Xvfb e um python3 do sistema (só a biblioteca padrão, para falar com a API).
# uso: pacote/linux/fumaca.sh [pasta do pacote: pacote/.build/MaiSim.AppDir, ou a MaiSim/ do .tar.gz]
set -uo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
. "$R/config/fala.sh"
A="$(cd "${1:-$R/pacote/.build/MaiSim.AppDir}" && pwd)"
P=7600
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# só o perfil do pacote ("só usar") e o daqui: nada do ambiente de quem chama
for k in $(compgen -v MAISIM_); do unset "$k"; done
export HOME="$T/home" MAISIM_PORTA=$P MAISIM_DADOS="$T/dados" MAISIM_CACHE="$T/cache" MAISIM_NAVEGADOR=nenhum MAISIM_TELA_X=":76"
mkdir -p "$HOME"
fala "fumaça: o MaiSim do pacote ($A, $(uname -m)) na porta $P" "smoke: the package's MaiSim ($A, $(uname -m)) on port $P"
setsid "$A/AppRun" > "$T/lancador.log" 2>&1 < /dev/null &
for _ in $(seq 1 180); do grep -qE "no ar em|running at" "$T/lancador.log" && break; grep -qE "Traceback|não ficou pronto|did not get ready" "$T/lancador.log" && break; sleep 2; done
if ! grep -qE "no ar em|running at" "$T/lancador.log"; then
  fala "fumaça: FALHOU — o MaiSim não subiu" "smoke: FAILED — MaiSim did not start" >&2; tail -20 "$T/lancador.log" >&2
  tail -20 "$MAISIM_CACHE/logs/gecko.log" "$MAISIM_CACHE/logs/motor.log" 2>/dev/null >&2; exit 1; fi
python3 "$R/pacote/fumaca_api.py" "$P" "$R"   # o buck, o PDF do Figuras e o controle em C (o mesmo do Windows)
ok=$?
"$A/python/bin/python3" "$A/maisim/app/lancador.py" --produto --parar > "$T/parar.log" 2>&1
sleep 3
sobra=$(ss -ltn | grep -cE ":76(0[0-6]) ")
if [ $ok -ne 0 ] || [ "$sobra" -ne 0 ]; then
  fala "fumaça: FALHOU (a API: $ok; portas ainda no ar: $sobra)" "smoke: FAILED (API: $ok; ports still up: $sobra)" >&2
  tail -20 "$T/lancador.log" >&2; exit 1; fi
fala "fumaça: ok — subiu, rodou o buck, gerou o PDF, rodou o controle em C e parou" "smoke: ok — started, ran the buck, made the PDF, ran the C control and stopped"
