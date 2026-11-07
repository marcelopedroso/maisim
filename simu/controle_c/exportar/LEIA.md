# {{CIRCUITO}} — o controle em C para {{ALVO}}

Gerado pelo MaiSim a partir do mesmo C que rodou na simulação (o SIL). Precisão: **{{PRECISAO}}**.

{{CONTROLADORES}}

## O que tem em cada pasta (um controlador = um firmware ou um bloco)

- `*.c`, `*.h`: o controle (o mesmo do MaiSim) e os módulos dele.
- `maisim_controle.h`: o contrato (`maisim_iniciar`, `maisim_passo`, `maisim_scope`, `maisim_envia`, `maisim_recebeu`).
- `maisim_sinais.h`: os índices das medidas (`M_…`), dos parâmetros (`P_…`) e das atuações (`U_…`) deste controlador.
- `maisim_parametros.h`: o Ts e os valores dos parâmetros do painel (o `p[]` de partida).
- `maisim_alvo.c`: o que o alvo dá ao controle (scope e mensagens): complete as mensagens se houver mais de um controlador.
- `alvos/`: o que é do alvo (veja abaixo).
- `teste/replay.c`: o mesmo controle no PC a partir de um CSV de medidas, para comparar com a rodada do MaiSim antes do hardware.

{{SECAO_ALVO}}
