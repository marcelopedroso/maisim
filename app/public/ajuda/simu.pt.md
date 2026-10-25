# Editor de circuitos (Simu)

O Simu (`/maisim/simu/`) é o ambiente gráfico onde você desenha esquemáticos elétricos, define sensores e sinais, configura a simulação e roda o GeckoCIRCUITS em segundo plano.

## Cabeçalho e barra superior

- **Abrir e Arquivo:** navegue pelos seus modelos, acesse os exemplos incluídos ou crie um arquivo em branco; salve com **Ctrl+S** (o ponto laranja indica alterações pendentes).
- **Simulação (▶ e ⚙):** inicie o cálculo numérico com o botão de reprodução ou tecle **Ctrl+Enter**; pause e continue com a tecla **Espaço**; o ícone de engrenagem configura o passo $\Delta t$ e o tempo total.
- **Doca do Scope e Controle:** botões para abrir a visualização do [Scope](#ajuda:scope) e a aba de [Controle](#ajuda:codigo) embutidas na mesma tela (ao lado ou embaixo).
- **Variáveis globais ($):** cadastre constantes e parâmetros de circuito; digite `$nome` em qualquer parâmetro de componente para vinculá-lo.

## Edição do esquema elétrico

- **Inserir componentes:** clique na paleta lateral (Fontes, Semicondutores, Passivos, Medidores) ou use a busca rápida, clicando em seguida na folha de desenho.
- **Manipulação básica:** selecione componentes com o mouse, gire com a tecla **R**, delete com **Delete** ou **Backspace**, e copie/cole com **Ctrl+C** e **Ctrl+V**.
- **Conexões e fios:** tecle **W** para entrar no modo de desenho de fios; clique de um terminal até outro; tecle **Backspace** para desfazer o último canto e **Esc** para cancelar.
- **Rótulos de nós:** aplique rótulos textuais nas ligações para conectar pontos distantes sem traçar linhas extensas.

## Painel de propriedades e sinais

- **Parâmetros do componente:** ao clicar em um elemento, o painel lateral exibe seus valores numéricos (resistência, indutância, frequências, ganhos).
- **Caixas de seleção de sinais:** marque `→ Scope` para enviar a medição ao osciloscópio, ou `→ Controle` para disponibilizar o valor como leitura no código Python.
- **Desativar componente:** marque a caixa para desabilitar o componente no circuito sem removê-lo fisicamente da folha.
- **Subcircuitos e biblioteca:** dê duplo clique em um subcircuito para abrir sua folha interna; use **Esc** para voltar; salve blocos frequentes na sua biblioteca pessoal.
