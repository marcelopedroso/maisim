# O Claude do MaiSim

O assistente de IA embarcado no MaiSim conecta modelos avançados de linguagem diretamente ao seu fluxo de projeto e sintonia de conversores estáticos.

## Como funciona a integração

- **Sessão isolada:** o login é feito pela interface de contas (botão **✦** ou ícone de IA no trilho lateral) e fica armazenado em `~/.claude-maisim/`, sem afetar credenciais globais do sistema.
- **Painel de conversa:** acessível diretamente na aba de [Controle](#ajuda:codigo), permitindo diálogo contínuo contextualizado com o projeto aberto.
- **Visibilidade do assistente:** o Claude enxerga a estrutura do esquemático, os sensores marcados, os atuadores, os scripts em Python e os relatórios numéricos da última rodada.
- **Propostas com inspeção de diferenças (diff):** alterações de código sugeridas pelo assistente não são aplicadas sozinhas; você confere as linhas alteradas e clica em Aplicar ou Descartar.

## Modo autônomo (simular sozinho)

- **Loop iterativo:** defina um número de iterações (3, 5, 10 ou 20 rodadas) para o Claude simular autonomamente, ler os resultados no Scope, ajustar ganhos e reavaliar.
- **Critérios de parada:** a IA interrompe o processo assim que a especificação de controle for atingida ou ao esgotar o limite configurado de rodadas.
- **Foco no algoritmo:** o modelo atua nas variáveis de controle e códigos Python; se houver necessidade de alterações na topologia elétrica, ele orientará quais componentes adicionar ou religar.
- **Instalação no Windows:** a janela de contas verifica e instala as ferramentas necessárias automaticamente com um clique quando não encontradas no sistema.
