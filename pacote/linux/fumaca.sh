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
python3 - "$P" "$R" <<'EOF'
import json, sys, time, urllib.parse, urllib.request
B = f"http://localhost:{sys.argv[1]}"
def api(rota, corpo=None, cru=False):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                               headers={"Content-Type": "application/json", "X-MaiSim": "1", "Origin": B})
    r = urllib.request.urlopen(q, timeout=600).read()
    return r if cru else json.loads(r)
api("/maisim/simu/editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
t0 = time.time()
j = api("/maisim/simu/editor/rodar", {"dt": "1e-06", "tfim": "0.005", "nome": "fumaca", "amostras": "500"})
while j.get("estado") in ("rodando", "pausada", "preparando"):
    time.sleep(0.3); j = api("/maisim/simu/editor/rodada")
assert j.get("estado") == "fim", f"a rodada não terminou: {j}"
print(f"fumaça: o buck rodou em {time.time() - t0:.1f} s ({j['arquivo']})")
arq = j["arquivo"]
canais = api("/maisim/figuras/canais?arq=" + urllib.parse.quote(arq))
nomes = [c["nome"] if isinstance(c, dict) else c for c in (canais.get("canais") or canais.get("sinais") or [])]
assert nomes, f"sem os sinais da rodada: {canais}"
pdf = api("/maisim/figuras/figura", {"arq": arq, "paineis": [{"sinais": [{"canal": nomes[0]}]}], "estilo": {"preset": "ieee1"}, "formato": "pdf"}, cru=True)
assert pdf.startswith(b"%PDF"), f"a figura não é um PDF: {pdf[:80]!r}"
print(f"fumaça: o PDF do Figuras ({nomes[0]}, {len(pdf)} bytes)")
# o controle em C com o TinyCC do pacote (a máquina pode não ter compilador: o tcc embutido compila): o buck com PWM em C
src = open(sys.argv[2] + "/simu/validacao/controle_c_api.py").read()
cod = src[src.index('CONTROLE_C = r"""') + len('CONTROLE_C = r"""'):]
cod = cod[:cod.index('"""')]
ex = json.load(open(sys.argv[2] + "/exemplos/exemplo_controle_pwm.controle.json"))
api("/maisim/simu/editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
api("/maisim/simu/editor/controle", {"controle": {**ex, "c": {"usar": True, "precisao": "double", "arquivos": {"controle.c": cod}}}})
j = api("/maisim/simu/editor/rodar", {"dt": "1e-06", "tfim": "0.002", "nome": "fumaca_c", "amostras": "500"})
while j.get("estado") in ("rodando", "pausada", "preparando"):
    time.sleep(0.3); j = api("/maisim/simu/editor/rodada")
assert j.get("estado") == "fim", f"o controle em C não rodou: {j.get('erro', j)}"
print("fumaça: o controle em C rodou (o TinyCC do pacote)")
EOF
ok=$?
"$A/python/bin/python3" "$A/maisim/app/lancador.py" --produto --parar > "$T/parar.log" 2>&1
sleep 3
sobra=$(ss -ltn | grep -cE ":76(0[0-6]) ")
if [ $ok -ne 0 ] || [ "$sobra" -ne 0 ]; then
  fala "fumaça: FALHOU (a API: $ok; portas ainda no ar: $sobra)" "smoke: FAILED (API: $ok; ports still up: $sobra)" >&2
  tail -20 "$T/lancador.log" >&2; exit 1; fi
fala "fumaça: ok — subiu, rodou o buck, gerou o PDF, rodou o controle em C e parou" "smoke: ok — started, ran the buck, made the PDF, ran the C control and stopped"
