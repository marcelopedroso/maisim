#!/usr/bin/env bash
# a bateria inteira na instância de teste (perfil config/teste.env: página 7200 → simulador 7201, scope 7202; ./sobe_teste.sh sobe tudo), um ensaio por
# vez: os de tela (Playwright, NODE_PATH com o playwright) e os de API. Os registros ficam em ~/.cache/maisim_teste/bateria/.
# Os do scope ao vivo (fila_tema_tela.js, scope_painel_tela.js) usam a instância isolada (./sobe_fila.sh) e ficam de fora.
V="$(cd "$(dirname "$0")" && pwd)"; L=~/.cache/maisim_teste/bateria; mkdir -p $L
export NODE_PATH=${NODE_PATH:-$HOME/ns-test/node_modules}
bash $V/reinicia_servidor_teste.sh; sleep 1
cd $V/tela
for t in largura_tela agy_tela gemini_tela contextos_tela erro_copia_tela claude_tex_tela scope_soma_tela scope_tema_tela scope_visoes_tela diagrama_zoom_tela envia_for_tela sem_esquema_tela renomear_tela sub_iguais_tela desativar_tela diagrama_tela escolha_tela mensagens_tela claude_controladores_tela arvore_tela tabelas_tela saida_tela giro_tela claude_modulos_tela modulos_tela divisor_tela beira_tela variaveis_tela selecao_tela copia_tela tag_tela rede_tela app_tela inicio_tela codigo_tela controladores_tela \
         dica_tela sub_terminais_tela sub_novo_tela claude_chat_tela escala_tela quebra_tela pontas_tela tema_tela cores_tela cabecalho_tela \
         validador_tela ajustes_tela claude_tela pwm_tela controle_tela passo2_tela revisao_tela guia_tela; do
  timeout 600 node $t.js > $L/$t.log 2>&1; echo "$t: saída $? · $(grep -c '^OK' $L/$t.log) OK $(grep -v '^OK' $L/$t.log | head -3 | tr '\n' ' ')"
done
rm -f *.png
cd $V
for t in amostra_t0_api agy_api gemini_api ia_troca_api claude_renova_api contextos_api padrao_janela_api claude_autonomo_api segue_codigo_api renomear_api janela_gecko_api colar_sms_api desativar_api claude_controladores_api atuacoes_modulos_api biblioteca_rotulos_api modulos_api move_api variaveis_api ponta_migra_api controladores_api teste_controle teste_passo2 teste_revisao atraso_caminhos \
         atraso_sub sub_terminais_api claude_pedido_api nao_salvo_api assinatura_api validador_offline casos_tracado; do
  timeout 900 python3 $t.py > $L/$t.log 2>&1; echo "$t: $(grep -E 'FALHA|falhas|primeira|sentiu|max' $L/$t.log | tail -4 | tr '\n' ' ')"
done
