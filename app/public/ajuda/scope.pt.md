# Scope e medições

O Scope (`/maisim/scope/`) é o osciloscópio multicanal do MaiSim para exibição de sinais ao vivo, comparação de simulações e análise matemática detalhada de circuitos de potência.

## Painéis e formas de onda

- **Organização modular:** crie múltiplos painéis e arraste sinais para agrupá-los ou separá-los por grandeza física (tensão, corrente, potência).
- **Zoom e navegação:** role a roda do mouse sobre o gráfico para ampliar; arraste horizontalmente para deslocar o eixo do tempo; dê duplo clique para restaurar o zoom original.
- **Eixos Y independentes ou travados:** defina limites verticais manuais para cada canal ou habilite o auto-ajuste dinâmico.
- **Cores e estilos:** altere cores de linha, espessuras e traçados (sólido, tracejado) clicando na amostra de cor do sinal.

## Ferramentas de análise e medição

- **Cálculos automáticos:** clique no menu de medição de um painel para visualizar valor médio, eficaz (RMS), pico a pico, frequência fundamental e taxa de distorção harmônica (THD).
- **Espectro harmônico (FFT):** abra a janela de Fourier para examinar o conteúdo em frequência da forma de onda selecionada.
- **Comparação de rodadas:** use a função de comparação para sobrepor os resultados da simulação atual com rodadas salvas anteriormente.
- **Exportação de dados:** exporte séries temporais nos formatos CSV ou NPZ para processamento externo no NumPy, MATLAB ou Python.
