# maisim-scope — scope web da co-simulação
Substitui os scopes do Gecko (que não abriram no WSL e guardam cada ponto de 1 µs) e mostra o que o Gecko não tem: a
corrente de braço estimada pelos SMs ao lado da real e da referência, N̂, P* e Q*, e a comparação de duas rodadas.

**Subir:** pelo MaiSim inteiro (`npm run maisim` em `app/`) e abrir **http://localhost:7100/maisim/scope/**, que a página
encaminha para o scope (MAISIM_PORTA_SCOPE, 7102); sozinho: `python3 scope/servidor.py` e
**http://localhost:7102/maisim/scope/**. A página usa endereços relativos a `/maisim/scope/`, e as rotas na raiz
continuam (quem publica rodadas de fora usa `/publicar`).
**Publicar uma rodada:** `scope/publica.py` (`PublicadorScope("http://localhost:7102")`): ao vivo, e o scope grava
`scope_<tag>.npz`. As rodadas do simulador aparecem sozinhas (MAISIM_RODADAS); outras pastas: MAISIM_SCOPE_PASTAS.

## Uso
- **Ao vivo**: a rodada em andamento (quem abre no meio recebe o que já veio). **Comparar**: A em cores, B (opcional)
  em preto tracejado; a lista mostra "planta · pasta · data hora". Link direto: `/maisim/scope/?a=<npz>&b=<npz>&x=<ms>,<ms>`;
  com `&so=rodada` (como o /maisim/simu abre o scope) ou numa rodada do /maisim/simu, só os painéis com sinais da rodada
  aparecem, e o índice só lista as suas seções (o layout guardado não muda). O gráfico acompanha a largura do cartão
  (ResizeObserver: painel criado com o scope escondido, tela dividida, índice aberto).
- A página abre com os painéis padrão em seções (porta CC e rede; correntes de braço; v_c; PWM; N̂); cada painel tem **Sinais ▾** (variáveis agrupadas: porta CC, potência, rede,
  tensões PWM, cada braço; com busca), título editável, remover (✕) e o menu **⋯** (largura na linha: inteira, 1/2 ou
  1/3; altura; PNG do painel). Cada painel tem a sua largura, então uma linha pode ter 1, 2 ou 3 painéis; **Por linha**
  põe todos com a mesma. **+ Painel**, **+ Seção**, **Layout padrão**; o arranjo fica guardado no navegador (layouts
  antigos: as colunas viram a largura). A ajuda está no **?** do cabeçalho.
- **☰ Índice**: barra ao lado com as seções e os painéis; clicar leva direto ao gráfico. **Uma seção por vez** mostra
  só a seção escolhida, como abas. Soltar um painel (alça ⠿) sobre uma seção do índice leva-o para o início dela.
- **Recolher, expandir, arrastar seções**: a seta ▾ recolhe a seção (os painéis somem) ou o painel (fica o título),
  guardado no layout; **⤢** expande o painel para a janela (Esc volta); a ⠿ da seção a leva inteira, com os painéis
  (no índice, arraste o nome dela). Ver a seção "Recolher, expandir e arrastar seções" abaixo.
- Zoom em cada painel: **zoom X | Y | área** escolhe o que o arrastar faz naquele painel (fica no layout guardado);
  **⟲** ou duplo clique = ver tudo naquele painel (vertical automática, ou o **Y fixo** se houver, e o tempo todo).
  O tempo é comum aos painéis ligados (ícone de corrente): zoom X num deles vale para todos os ligados. Clicar na
  corrente solta o painel (corrente partida, laranja): o zoom no tempo, o ⟲ e o passo fino
  passam a valer só para ele. O zoom Y vale só para o painel onde foi feito. **Ctrl + roda** = zoom no tempo;
  Ctrl + Shift + roda = vertical (a roda sozinha rola a página). O cursor continua sincronizado entre todos os painéis.
  **Fixar eixos** (ao vivo não reajusta), **Pausar** (não redesenha). **Salvar figura**: todos os painéis num PNG.
- **Medir** (em cada painel): média, série de Fourier (pico ∠ fase de cada harmônico pedido) e THD (h 2–50) de cada
  sinal do painel numa janela de **n períodos inteiros de f₀ a partir de t₀**. **Shift + arrastar** no gráfico escolhe o
  intervalo (começa onde o arrasto começa, com os períodos inteiros que cabem; não dá zoom); **usar o visível** pega o
  que está à vista; t₀, n, f₀ e a lista de harmônicos (ex.: `1, 2, 3` ou `1-7`) também se digitam. A janela aparece
  sombreada no gráfico. Mesmo método de `smauto.metrics` (`window`, `harmonic_phasors`, `thd`): amostras com
  t₀ − 1 ns ≤ t < t₀ + n/f₀ − 1 ns, pico = |X_hn|·2/N, fase do cosseno referida ao início da janela. Valor real (sem o
  ×k da tela); canais "passo fino" a cada 1 µs, os outros a cada janela de controle (20 µs); a coluna N mostra as
  amostras e o passo. Se a janela passa do fim dos dados ou tem amostra faltando, a linha diz isso e não mede.
  Conferido contra o `smauto.metrics` na gravação do Gecko de 600 V (8 casos, por janela de controle e no passo fino): diferença ≤ 3·10⁻¹²
  da fundamental. As amostras que faltam nas gravações vão do servidor como null (antes iam como 0).
  Harmônicos: a lista por vírgulas, mais **ímpares até** e/ou **pares até** um valor (marcar e digitar; somam-se).
- **Espectro** (na medição): barras de CC e h = 1 … h máx (pico) de cada sinal da tabela, escala log (décadas abaixo
  do maior: padrão 4; marcas em 1, 2 e 5 de cada década, para ler um fator 2 no eixo) ou linear; passar o mouse mostra pico ∠ fase e % de h1; clicar no nome de um sinal na tabela tira-o ou põe-o no
  espectro. Com N = n·P amostras (P inteiro por período), os n períodos são somados num só antes da DFT, o que é exato
  para os bins h·n e deixa h máx alto rápido; com P não inteiro (ex.: f₀ = 60 Hz a 20 µs), DFT direta. Conferido
  contra numpy (`harmonic_phasors`) até h = 600, inclusive a DFT direta: ≤ 3·10⁻¹⁴ do maior.
- **Pulsos e tensões PWM** (marcados "passo fino" na lista): o `run.py` publica, por janela de controle, o padrão de
  chaveamento comandado de cada SM (bits por passo fino, mesma conta da portadora que a planta faz). Com zoom abaixo de
  40 ms a página reconstrói os pulsos, a tensão de cada braço Σ s_j·v_c,j e a de perna (v_l − v_u)/2 com a resolução do
  passo fino (1 µs); com zoom maior, mostra a média em cada janela (σ). v_c dentro da janela é o valor do início dela.
  Rodadas gravadas antes desta versão não têm os pulsos. As contas do passo fino usam só vetores numéricos (sem texto
  nos laços) e ficam em cache por faixa de janelas.
- **Medidas no Gecko a cada passo fino** (planta Gecko): tensões de linha no conversor v_ab, v_bc, v_ca (va0 − vb0…),
  correntes da rede e V_dc, como o Gecko as guarda no SCOPE.1 (ponte: SIGDATA, por rótulo). O gateway busca os trechos
  a cada 250 janelas (5 ms simulados; 7 chamadas) e o `run.py` publica como `fino_<nome>` (correntes com o sinal do
  Python). Por isso o SCOPE.1 do modelo 02 tem de ficar: é o gravador.

- **Abrir uma gravação**: a página pede `rodada.bin` (binário: os valores exatos do .npz em float64, sem o
  arredondamento de 6 casas do JSON; NaN continua NaN; padrões de chaveamento como inteiros de 32 bits quando é exato)
  e, se o servidor for antigo, cai no `rodada` (JSON). Na gravação do Gecko de 600 V (84 canais, 94 MB): servidor 1,0 s
  contra 6,1 s do JSON; até os painéis 2,8 s direto e 3,3 s pelo MaiSim, contra 9–12 s e 16–17 s. Conferido: decodificado
  igual ao .npz bit a bit; medição contra smauto.metrics nos dados exatos ≤ 9·10⁻¹³ da fundamental.

- **Rodadas de fora do MMC** (ex.: /maisim/simu): os canais que não são do catálogo do MMC aparecem em "Sinais da
  rodada" no Sinais ▾, e um painel com eles é posto no topo se nenhum painel os mostra. Numa rodada do /maisim/simu, os
  painéis sem dados (os do MMC) se escondem. Ao vivo, painel sem dados não força mais remontar tudo a cada lote.

- **Conexão ao vivo só com a aba à vista** (18/10, chat do simu; pedido de Marcelo: "a lateral some, demora"): o
  navegador abre no máximo 6 conexões HTTP/1.1 por endereço (localhost:5000), somando as abas, e cada `EventSource` do
  ao vivo segura uma. Com 6 abas do scope, ou do simu com o scope embutido, a próxima página do MaiSim ficava na fila,
  sem o trilho. Medido numa instância isolada: com 6 abas à vista, a página inicial não carrega em 6 s; com elas
  escondidas, carrega em ~0,1 s. Agora o `scope.js` fecha o `EventSource` quando a aba vai para o segundo plano
  (`visibilitychange`) e reconecta ao voltar. O servidor manda a rodada desde o começo para quem chega, então nada se
  perde. Aberta em segundo plano, só conecta quando aparece.
  * Só fecha depois de **30 s** escondida (`esperaEscondida`): trocar de aba rápido não reenvia a rodada.
  * **Rodada numerada**: a meta não identifica a rodada (repetir a mesma dá meta igual), então o servidor acrescenta
    `_rodada_vivo` (`<partida do servidor>-<n>`) a cada `inicio` publicado. Na página, só o 1º `inicio` de cada conexão
    (a repetição) com a meta igual é "a mesma rodada": painéis e zoom ficam e a medição recalcula (`A.ger` entra na
    chave). Qualquer outro `inicio` é rodada nova, como antes. Com um servidor antigo (sem o número), vale a regra do
    1º `inicio`.
  * O reenvio para quem conecta é serializado **fora da trava** (antes, dentro): uma rodada grande não para o
    servidor. A foto e a inscrição na fila continuam juntas, então a ordem dos eventos não muda.
  * Revisado por workflow adversarial (8 achados confirmados, todos corrigidos). Teste:
    `simu/validacao/tela/fila_tema_tela.js` 24/24, numa instância isolada (`simu/validacao/sobe_fila.sh`). O
    segundo plano é simulado (`document.hidden` + `visibilitychange`); a fila de 6 conexões é a real do Chromium.
  * O servidor do scope em uso só pega a numeração depois de reiniciado (`npm run maisim`).

- **Cores** (18/10, chat do simu; pedido de Marcelo):
  * **Comparar**: B tinha todos os sinais em preto tracejado (`#111`) e, com vários sinais, não dava para saber quem era
    quem. Agora B usa a cor do mesmo sinal em A, misturada com o branco a 50% (`corClara`), tracejada; legenda, cursor e
    espectro seguem a mesma cor.
  * **A cor de cada sinal**: em Sinais ▾, uma amostra ao lado do ×1 abre a paleta das clássicas (14: vermelho,
    vermelho escuro, laranja, marrom, ouro, verde, verde escuro, ciano, azul, azul escuro, roxo, magenta, cinza,
    preto), um campo `#rrggbb` (Enter; `#rgb` também), o seletor livre do navegador e "padrão" (volta à paleta pela
    ordem). Vale para o mesmo sinal em todos os painéis e fica no navegador (`maisim-scope-cores`).
  * Defeito achado no caminho: um clique num botão que o próprio menu redesenha fechava o menu, porque o botão já tinha
    saído da página quando o clique chegava ao documento. O fechamento agora olha o caminho do clique na hora em que
    ele aconteceu (`composedPath`).
  * Teste: `simu/validacao/tela/scope_cores_tela.js` 10/10, na instância isolada (`sobe_fila.sh`), só lendo duas
    gravações do simu.

## Arquivos
`servidor.py` (HTTP + Server-Sent Events, só biblioteca padrão), `publica.py` (fila com envio em lotes e as máscaras de
PWM), `static/` (página; uPlot 1.6.30, MIT, cópia local). Sem `--scope`, o `run.py` não muda (séries idênticas).
Próximos: medidas no cursor.

## Painel novo sumindo em "só a rodada" (19/10, achado de Marcelo)
- "Quando coloquei painel novo e selecionei o que medir, ele não apareceu; daí quando fui em + novo painel apareceram os
  dois": marcar o 1º sinal guarda o layout (que recalcula quem aparece) antes de montar o gráfico, e em "só a rodada" um
  painel com sinais e sem gráfico era tratado como painel do MMC e escondido; nada recalculava depois, até a próxima
  mudança no layout. Agora quem decide é a existência dos sinais na rodada (`mostravel`, pelos dados), não ter gráfico.
- O "+ Painel" do topo, em "só a rodada", vai para o fim da seção da rodada (antes ia para o fim do layout, numa seção do
  MMC escondida).
- Prova: `simu/validacao/tela/scope_painel_tela.js` 6/6 na instância isolada (falha no código antigo: o painel
  montado escondido, com 300 px); `fila_tema_tela.js` 24/24.

## Comparar com intervalos diferentes (19/10, achado de Marcelo)
- "Nesse comparar, não seria interessante o nome da simulação? E para comparar, precisa do mesmo passo? Múltiplo?
  Intervalo?" — a pergunta achou um erro: o Comparar casava a amostra k da B com a k da A. Com intervalos de
  amostragem diferentes (o tempo final ÷ as amostras guardadas do ⚙ — as rodadas dele de hoje tinham 100 µs e 200 µs), a B
  aparecia esticada ou encolhida no tempo, sem aviso; e a medição da B usava o intervalo da A.
- Agora: com os mesmos instantes, como sempre (casar pela amostra); com instantes diferentes, o eixo do tempo é a união
  dos instantes das duas e cada série vai nos SEUS (null nos da outra; `spanGaps` liga os pontos), sem inventar valor
  entre amostras — qualquer Δt, intervalo, começo ou duração. O status avisa ("intervalos diferentes (A 100 µs, B 200
  µs): cada uma nos seus instantes"). A medição de cada rodada usa o intervalo dela. O modo fino (canais do gateway do
  MMC) fica desligado quando as grades diferem.
- A lista das gravações mostra o circuito e o intervalo: "MaiSim / simu · marcelo_1 · Teste2 · 19/10 09:48 · 200 µs".
- Prova: `simu/validacao/tela/comparar_tela.js` 6/6 na instância isolada — a mesma senoide de 50 Hz com 100 µs e com
  200 µs: a B nos instantes dela com erro máximo de 3e-13 V (no código antigo, 360 V: o teste falha nele), a medição com o
  intervalo de cada uma, a lista, e A × A sem aviso. `scope_painel_tela.js` 6/6 e `fila_tema_tela.js` 24/24.

## Recolher, expandir e arrastar seções (19/10, pedido de Marcelo)
- "Quando tiver painel, poder expandir, recolher… e se ainda der drag and drop para eles": o arrastar de painel (alça ⠿)
  já existia; entraram:
  * **seta ▾ da seção**: recolhe a seção — os painéis dela somem e o título mostra quantos são ("3 painéis"); no índice
    ela aparece com ▸. Ir a um painel dela pelo índice, soltar um painel nela ou o "+ Painel" abrem a seção;
  * **seta ▾ do painel**: fica só a linha do título (sem as ferramentas); abrir devolve o gráfico na largura certa;
  * os dois ficam no layout guardado (`recolhida` na seção, `recolhido` no painel; layouts antigos abrem tudo aberto);
  * **⤢ expandir**: o painel ocupa a janela inteira (no simu, a doca do scope), com o fundo escurecido; Esc, ⤡ ou um
    clique fora voltam ao tamanho de antes. Enquanto expandido, o ✕ de remover some (ao lado do voltar, apagaria o
    painel por engano). Não fica guardado;
  * **⠿ da seção**: arrasta a seção inteira, com os painéis dela; cai antes da seção que estiver abaixo do mouse, ou no
    fim, se não houver nenhuma (a linha azul mostra onde). No **índice**, o nome da seção também arrasta (layout longo:
    sem rolar a página durante o arrasto).
- Prova: `simu/validacao/tela/scope_recolher_tela.js` 15/15 na instância isolada (três seções sobre uma gravação
  pequena): recolher a seção e o painel, guardados ao recarregar, abrir de novo com o gráfico; expandir (1324 × 1280 px
  numa janela de 1400 × 1300) e voltar ao tamanho exato por Esc e pelo clique fora; a S3 para antes da S1, a S1 para o fim,
  a ordem guardada; o nome da S1 no índice para o topo; e o arrastar de painel dentro de um iframe, como na doca do simu.
  `scope_painel_tela.js` 6/6, `comparar_tela.js` 6/6, `scope_cores_tela.js` 10/10, `fila_tema_tela.js` 24/24.
- Achado ao testar: o `dragAndDrop` do Playwright não começa o arrasto quando precisa rolar a página até o alvo (nenhum
  evento de arrasto sai); o teste arrasta como uma pessoa (desce o botão, anda em passos, solta) numa janela alta.
