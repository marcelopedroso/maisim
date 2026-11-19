# Guia do script do MaiSim

## O que é
Um programa Python comum. O MaiSim roda o script num processo à parte, na pasta dele, com prazo (padrão 120 s), e mostra
o que ele imprime (print) e os erros. Não há circuito nem passo de simulação imposto: o script decide o tempo, o passo e
as contas (laço passo a passo ou numpy vetorizado).

## Mandar para o Scope
```python
import numpy as np
import maisim

t = np.arange(0, 0.05, 1e-6)                    # o tempo em segundos, crescente
v = 311 * np.sin(2 * np.pi * 60 * t)
i = 10 * np.sin(2 * np.pi * 60 * t - 0.5)
maisim.scope("nome_da_rodada", t, {"v_saida": v, "i_carga": i},
             panels=[["v_saida"], ["i_carga"]])
```
- Cada chamada grava uma rodada no Scope (a pessoa clica em "Ver no Scope"). Pode chamar mais de uma vez (casos
  diferentes, para comparar).
- `t`: um vetor com pelo menos 2 amostras, estritamente crescente. Cada sinal: um vetor do tamanho de `t`.
- Nomes de sinais: letras, números e `_` (outros caracteres viram `_`); `t` e `meta` são reservados.
- `panels` (ou `paineis`): a lista de painéis, cada um com os sinais que aparecem juntos. Fica como o layout padrão do
  Scope para este script.

## Pronto para as Figuras (artigo)
O módulo Figuras do MaiSim faz a figura de artigo a partir da rodada. Para ela sair boa sem retrabalho:
- Nomes com a grandeza na frente, que viram rótulo com subscrito: `v_o`, `i_L`, `v_ref`, `P_out`, `theta` (vira θ). O
  Figuras sugere a unidade pelo nome: `v…` V, `i…` A, `P…` W, `T…`/`Tj…` °C, `theta` rad.
- Um painel por grandeza (tensões juntas, correntes juntas); no máximo 3 ou 4 sinais por painel.
- Grave só a janela que interessa (o regime, o transitório) e um passo que não deixe o arquivo enorme: para figura,
  algumas dezenas de milhares de pontos bastam (sub-amostre o resultado, não a simulação).
- Sinais em unidades do SI (o Figuras escolhe ms, µs… no eixo do tempo).

## Projeto em pastas
- O script roda na pasta dele; os outros .py da mesma pasta importam-se normalmente (`from calc import f`).
- Uma subpasta vira pacote: `from libs import modulacao`, `from libs.carga import CargaRL`.
- Uma pasta `libs/` na raiz dos scripts da pessoa serve a todos os scripts.

## Boas práticas
- Parâmetros no começo, com a unidade no comentário.
- Imprima um resumo curto no fim (valores de regime, erros, o que conferir no Scope).
- Sem janelas: matplotlib roda sem tela (Agg); para ver, use o Scope (ou salve uma imagem, se a pessoa pedir).
- Sem rede, sem instalar pacotes, sem ler ou escrever fora da pasta do script.
- Bibliotecas: numpy e matplotlib sempre estão lá (o MaiSim instalado leva as duas); scipy, sympy e python-control não.
  Uma função de transferência vira equações de estado integradas com numpy (RK4 com passo bem menor que a menor
  constante de tempo); um controlador discreto, a equação de diferenças dele no laço.
