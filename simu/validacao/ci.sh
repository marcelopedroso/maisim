#!/usr/bin/env bash
# Os testes do MaiSim num comando só, na instância de teste já no ar (./sobe_teste.sh; perfil config/teste.env) — o que o
# GitHub Actions roda, e o mesmo na sua máquina:
#   ./ci.sh rapido     a verificação de cada PR (~10 min): os offline e o essencial de API e de tela
#   ./ci.sh completo   a bateria inteira (~70 min): tela, API, offline e, na instância isolada (sobe_fila.sh), o scope ao vivo
#   ./ci.sh <teste>…   só os testes dados (ex.: ./ci.sh inicio_tela amostra_t0_api)
# Um teste falha se sair com código diferente de 0, escrever uma linha FALHA (ou "· FALHA"), um Traceback, ou nenhum OK.
# Termina com código 1 se algum falhou. Registros e fotos em ~/.cache/maisim_teste/bateria/ (o resumo em resumo.txt).
# No CI (CI=true) ficam de fora os que dependem do login de verdade do Claude (SO_NA_MAQUINA).
set -u
V="$(cd "$(dirname "$0")" && pwd)"
unset $(compgen -v MAISIM_); eval "$(python3 "$V/../../config/ler_config.py" --shell teste)"
L="$MAISIM_DADOS/bateria"; mkdir -p "$L"; : > "$L/resumo.txt"
export NODE_PATH=${NODE_PATH:-$HOME/ns-test/node_modules}

OFFLINE="validador_offline casos_tracado claude_offline lingua_offline"
TELA="largura_tela scope_menu_tela agy_tela gemini_tela contextos_tela erro_copia_tela claude_tex_tela scope_soma_tela scope_potencia_tela scope_tema_tela scope_visoes_tela
  diagrama_zoom_tela envia_for_tela sem_esquema_tela renomear_tela sub_iguais_tela desativar_tela diagrama_tela escolha_tela mensagens_tela
  claude_controladores_tela arvore_tela tabelas_tela saida_tela giro_tela claude_modulos_tela modulos_tela divisor_tela beira_tela
  scope_cursores_tela variaveis_tela parametros_tela selecao_tela fechar_tela trilho_ia_tela scope_fora_tela scope_no_painel_tela scope_padrao_tela copia_tela tag_tela rede_tela app_tela inicio_tela codigo_tela controladores_tela dica_tela sub_terminais_tela
  lingua_tela sub_novo_tela claude_chat_tela escala_tela quebra_tela pontas_tela tema_tela cores_tela cabecalho_tela validador_tela ajustes_tela
  claude_tela pwm_tela controle_tela passo2_tela revisao_tela guia_tela scope_notacao_tela varias_saidas_tela"
API="lingua_api lingua_ia_api rodadas_api exemplos_api amostra_t0_api agy_api gemini_api ia_troca_api claude_renova_api contextos_api padrao_janela_api claude_autonomo_api segue_codigo_api
  renomear_api janela_gecko_api colar_sms_api desativar_api fonte_gerador_api nomes_ocultos_api claude_controladores_api atuacoes_modulos_api biblioteca_rotulos_api modulos_api
  move_api variaveis_api ponta_migra_api controladores_api teste_controle teste_passo2 teste_revisao atraso_caminhos atraso_sub
  sub_terminais_api claude_pedido_api nao_salvo_api assinatura_api destino_api varias_saidas_api gecko_novo_api"
ISOLADOS="fila_tema_tela scope_painel_tela comparar_tela scope_cores_tela scope_recolher_tela scope_apagar_tela"   # na instância isolada (sobe_fila.sh): o scope ao vivo
RAPIDO="$OFFLINE amostra_t0_api assinatura_api nao_salvo_api controladores_api teste_controle atraso_caminhos atraso_sub
  biblioteca_rotulos_api ia_troca_api contextos_api largura_tela lingua_tela inicio_tela app_tela scope_visoes_tela cabecalho_tela validador_tela
  controle_tela lingua_api destino_api nomes_ocultos_api fonte_gerador_api varias_saidas_api"
SO_NA_MAQUINA="claude_tela"                          # o link do login de verdade do Claude (às vezes atrasa)

falhou=0
roda() {                                              # um teste: o tipo vem do nome (_tela: Playwright; o resto: Python)
  local t=$1 log="$L/$1.log" ini cod ok fa r="ok"
  if [ "${CI:-}" = true ] && [[ " $SO_NA_MAQUINA " == *" $t "* ]]; then
    printf "%-28s pulado (só na máquina: depende do login de verdade do Claude)\n" "$t" | tee -a "$L/resumo.txt"; return; fi
  ini=$(date +%s)
  if [[ $t == *_tela ]]; then (cd "$V/tela" && NODE_OPTIONS="--require \"$V/tela/_lingua.js\"${NODE_OPTIONS:+ $NODE_OPTIONS}" timeout 600 node "$t.js") > "$log" 2>&1
  else (cd "$V" && timeout 900 python3 "$t.py") > "$log" 2>&1; fi
  cod=$?
  ok=$(grep -cE '^OK|· OK' "$log"); fa=$(grep -cE '^FALHA|· FALHA|Traceback' "$log")
  if [ "$cod" -ne 0 ] || [ "$fa" -gt 0 ] || [ "$ok" -eq 0 ]; then r="FALHOU"; falhou=1; fi
  printf "%-28s %-7s OK %3s · falhas %2s · saída %3s · %4ss\n" "$t" "$r" "$ok" "$fa" "$cod" "$(( $(date +%s) - ini ))" | tee -a "$L/resumo.txt"
  if [ "$r" = FALHOU ]; then grep -E '^FALHA|· FALHA|Error|Traceback' "$log" | head -3 | cut -c1-240 | sed 's/^/    /' | tee -a "$L/resumo.txt"; fi
  mv "$V"/tela/*.png "$L/" 2>/dev/null || true       # as fotos dos testes de tela: com os registros, fora do repositório
}

case "${1:-}" in
  rapido) LISTA=$RAPIDO; ISO="";;
  completo) LISTA="$TELA $API $OFFLINE"; ISO=$ISOLADOS;;
  "") echo "uso: ci.sh rapido | completo | <teste>…"; exit 2;;
  *) LISTA="$*"; ISO="";;
esac
bash "$V/reinicia_servidor_teste.sh"; sleep 1          # o simulador de teste do zero (o Gecko e o motor ficam)
echo "maisim: testes ($1) na instância de teste — registros em $L"
for t in $LISTA; do roda "$t"; done
if [ -n "$ISO" ]; then
  bash "$V/desce_fila.sh" > /dev/null 2>&1          # sobra de uma vez anterior
  bash "$V/sobe_fila.sh" > "$L/sobe_fila.log" 2>&1 || { echo "a instância isolada não subiu (veja $L/sobe_fila.log)" | tee -a "$L/resumo.txt"; falhou=1; }
  for t in $ISO; do roda "$t"; done
  bash "$V/desce_fila.sh" > /dev/null 2>&1
fi
n=$(grep -cE ' (ok|FALHOU) ' "$L/resumo.txt"); f=$(grep -c ' FALHOU ' "$L/resumo.txt")
echo "maisim: $((n - f)) de $n passaram$( [ "$f" -gt 0 ] && echo "; FALHARAM: $(grep ' FALHOU ' "$L/resumo.txt" | awk '{print $1}' | tr '\n' ' ')")" | tee -a "$L/resumo.txt"
exit $falhou
