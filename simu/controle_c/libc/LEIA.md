# Cabeçalhos mínimos da libc para o TinyCC embutido

O TinyCC que vem com o MaiSim (o `tcc/` dos pacotes) compila o controle em C com estes cabeçalhos, e não com os do
sistema (`-nostdinc`). Assim o C compila igual em qualquer Linux, mesmo sem as ferramentas de programador (sem o
`libc6-dev`), e dá o mesmo resultado em toda máquina. As funções são as da libc e da libm do sistema, que o processo do
Python já carrega; a biblioteca do controle é ligada sem elas (`-nostdlib`) e as acha ao carregar.

Valem para Linux de 64 bits (x86_64 e aarch64, LP64). No Windows, o TinyCC usa os cabeçalhos dele, que vêm no pacote.

Só declaram o que um controle usa: `math.h`, `string.h`, `stdio.h` (o `printf` para depurar), `stdlib.h`, `stdint.h`
e `limits.h`. Os de `stddef.h`, `stdarg.h`, `stdbool.h` e `float.h` são os do próprio TinyCC.
