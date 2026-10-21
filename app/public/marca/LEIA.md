# Marca do MaiSim

O **diodo com o brilho de IA**: o símbolo do diodo, a peça central da eletrônica de potência, com a estrela de quatro
pontas que virou o sinal de "IA". Ideia e direção de Marcelo Pedroso (18/10/2026; ele vetou o rosto e o clipe);
desenho feito com o Claude.

| Arquivo | Uso |
|---|---|
| `maisim-icone.svg` | o ícone (lilás `#6d28d9`, triângulo `#ede9fe`): slides, artigos, avatar |
| `maisim-icone-escuro.svg` | sobre fundo escuro (`#c4b5fd`, triângulo `#2b2440`), como no trilho |
| `maisim-icone-uma-cor.svg` | impressão em uma cor (preto, triângulo branco) |
| `maisim-favicon.svg` | o ícone da aba (diodo branco num quadrado lilás); é o `../favicon.svg` |
| `maisim-logo.svg` | o ícone com "MaiSim" e "Open-source power electronics simulation and control platform" (texto em Inter/system-ui: para impressão, converter o texto em curvas) |

- Cores: lilás `#6d28d9` (claro) e `#8b5cf6`/`#c4b5fd` (escuro), as do MaiSim.
- **Claude do MaiSim** usa outro ícone: um balão de conversa com o brilho dentro, desenhado aqui. **Nunca** o logotipo da
  Anthropic: as diretrizes dela pedem aprovação prévia e proíbem alterar ou dar a entender parceria
  (https://www.anthropic.com/legal/trademark-guidelines).
- Proteção: as peças isoladas (o símbolo do diodo, a estrela de "IA") são de uso comum; a combinação é do MaiSim. Para
  registrar como marca (INPI), fazer antes uma busca de anterioridade, inclusive do nome "MaiSim".

## O MaiSim como app (PWA)
- `../manifest.webmanifest` (nome MaiSim, `display: standalone`, cor #6d28d9) e os ícones do app `maisim-app-192.png` e
  `maisim-app-512.png` (o favicon — o diodo branco no quadrado violeta — desenhado pelo Chromium nesses tamanhos). Cada
  página do MaiSim (início, simu, scope, Gecko) aponta para o manifesto.
- Instalar: no Chrome, o ícone de instalar na barra de endereço, ou ⋮ → "Transmitir, salvar e compartilhar" → "Instalar
  MaiSim". Instalado, o MaiSim abre como programa: janelas sem barra de endereço (a do código e a do scope também), com o ícone
  na barra de tarefas. Pela aba, nada muda.

