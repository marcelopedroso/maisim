## No Typhoon HIL (`alvos/typhoon/typhoon.txt`)

1. No Schematic Editor, ponha um bloco **C function** (Signal processing → Extra) no lado do controle.
2. Configure as entradas e as saídas (reais, com os nomes do arquivo) e o Execution rate = Ts.
3. Copie cada seção do `typhoon.txt` (Global variables, Init function, Output function) para a aba de mesmo nome.

## Cuidados

- O código vai todo na aba Global variables (o controle e os módulos juntos, sem `#include` locais): mude no MaiSim e
  exporte de novo, em vez de editar lá.
- Os nomes das portas são os dos sinais do MaiSim (como identificadores de C).
