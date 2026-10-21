# KaTeX 0.18.11 (MIT, LICENSE.txt) — as equações nas respostas do Claude do PEW
Do pacote npm `katex@0.18.11` (dist/): katex.min.js, katex.min.css e as fontes .woff2, tudo nesta pasta (o servidor do simu
serve só arquivos soltos: /static/katex/<nome>). No CSS, as fontes apontam para o nome solto e só em woff2 (as reservas
.woff e .ttf saíram). Uso: claude_chat.js (mdLeve → tex()).
