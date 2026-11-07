## No PLECS (`alvos/plecs/plecs.txt`)

1. Ponha um bloco **C-Script** (Control → Functions & Tables).
2. Em Setup: o número de entradas e de saídas do arquivo, o Sample time = Ts e o Direct feedthrough ligado.
3. Em Code: copie cada seção do `plecs.txt` (Code declarations, Start function code, Output function code).
4. Na entrada, um **Mux** das medidas na ordem do arquivo; na saída, um **Demux** das atuações.

## Cuidados

- O código vai todo em Code declarations (o controle e os módulos juntos): mude no MaiSim e exporte de novo.
- O tempo é o `CurrentTime` do PLECS.
