#!/usr/bin/env bash
# Leva à placa do HIL (um Raspberry Pi ou outro Linux com python3 e gcc, por ssh) só o que o controle em C precisa para rodar
# nela — o placa.py, os workers do controle, o contrato do C e os textos — gera a chave dela (se ainda não houver) e mostra as
# duas linhas do .env do PC. Roda no PC (Linux, WSL ou o Git Bash do Windows).
#   simu/hil/instala_placa.sh usuario@placa [--pasta ~/maisim_placa] [--servico]
# --servico: o placa.py sobe com a placa (uma linha @reboot no crontab do usuário) e já fica no ar agora.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ALVO=${1:?"uso: $0 usuario@placa [--pasta DIR] [--servico]"}; shift
PASTA='~/maisim_placa'; SERVICO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pasta) PASTA=$2; shift 2 ;;
    --servico) SERVICO=1; shift ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
done
echo "== levando o MaiSim da placa para $ALVO:$PASTA"
(cd "$RAIZ" && tar cf - --exclude=__pycache__ --exclude=simu/hil/resultados VERSION config simu/*.py simu/controle_c simu/biblioteca_controle simu/hil) |
  ssh "$ALVO" "mkdir -p $PASTA && cd $PASTA && tar xf - 2>/dev/null; command -v gcc >/dev/null || echo 'AVISO: a placa não tem gcc (sudo apt install gcc)'"
ssh "$ALVO" "cd $PASTA && { [ -f ~/.config/maisim_hil/chave ] || python3 simu/hil/placa.py --gera-chave >/dev/null; }"
IP=$(ssh "$ALVO" "tailscale ip -4 2>/dev/null | head -1" || true)
[ -n "$IP" ] || IP=$(ssh "$ALVO" "hostname -I | cut -d' ' -f1")
if [ "$SERVICO" = 1 ]; then
  # o pkill numa chamada só dele: a linha de comando de quem o roda não pode ter o nome do placa.py (ele se mataria)
  ssh "$ALVO" "pkill -f 'simu/hil/plac[a].py' 2>/dev/null; true"
  ssh "$ALVO" "mkdir -p ~/.cache/maisim_hil; (crontab -l 2>/dev/null | grep -v 'simu/hil/plac[a].py'; echo \"@reboot sleep 30 && cd $PASTA && python3 -u simu/hil/placa.py --host $IP >> ~/.cache/maisim_hil/placa.log 2>&1\") | crontab -
    cd $PASTA && (nohup python3 -u simu/hil/placa.py --host $IP >> ~/.cache/maisim_hil/placa.log 2>&1 < /dev/null &)"
  echo "== o placa.py sobe com a placa (crontab) e já está no ar em $IP:7190"
else
  echo "== para pôr no ar: ssh $ALVO 'cd $PASTA && python3 simu/hil/placa.py --host $IP'"
fi
echo "== no .env da raiz do MaiSim no PC (no Windows instalado: %APPDATA%\\MaiSim\\maisim.env):"
echo "MAISIM_HIL=$IP:7190"
echo "MAISIM_HIL_CHAVE=$(ssh "$ALVO" 'cat ~/.config/maisim_hil/chave')"
