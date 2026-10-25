# A ajuda do MaiSim (F1)

Os textos da ajuda que o **F1** (ou o **?** do trilho) abre ao lado de qualquer página do MaiSim: um tópico por tela, cada
um num par de arquivos, `<tópico>.pt.md` e `<tópico>.en.md`. O painel é o `app/public/maisim-ajuda.js` (os rótulos dele em
`app/public/textos_ajuda.js`); a página inteira, com todos os tópicos, é `app/public/ajuda.html`.

| tópico | quando o F1 abre nele |
|---|---|
| `comecar` | primeiros passos (o caminho circuito → simular → scope → controle → IA) |
| `inicio` | na página inicial (`/`) |
| `simu` | no editor de circuitos (`/maisim/simu/`) |
| `codigo` | no código do controle (`/maisim/simu/?vista=codigo`, ou com a aba Controle aberta) |
| `scope` | no scope (`/maisim/scope/`) |
| `ia` | o Claude do MaiSim (as contas, a conversa, simular sozinho) |
| `atalhos` | todas as teclas, de todas as telas |

## Como escrever

- Os dois idiomas com a **mesma estrutura**: os mesmos títulos (nível e ordem), os mesmos itens de lista, as mesmas tabelas
  (células por linha) e os mesmos blocos de código. `simu/validacao/lingua_offline.py` confere o par (em todo PR).
- Para quem **usa** o MaiSim (engenheiro de eletrônica de potência), não para quem programa: o que cada botão faz, onde
  fica, o que acontece. Os nomes dos botões como estão na tela (os dicionários `textos_*.js` têm os dois idiomas).
- Um `# título` só, no começo; seções com `##`; frases curtas; teclas em `**Ctrl+S**`.
- Links entre tópicos: `[texto](#ajuda:simu)`; para o guia do controle: `/maisim/simu/static/guia.html`.
