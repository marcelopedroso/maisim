/* maisim_alvo.c — o que o alvo dá ao controle (gerado pelo MaiSim). No SIL, o MaiSim tinha a versão dele; aqui, a sua:
   - maisim_scope: no alvo, nada (ou um log, um DAC para ver no osciloscópio);
   - maisim_envia / maisim_recebeu: as mensagens entre controladores — a sua comunicação (CAN, SPI, IPC entre CPU1 e CPU2…).
     Um controlador só não usa: deixe como está. */
#include "maisim_controle.h"

void maisim_scope(const char *nome, maisim_real valor) {
    (void)nome; (void)valor;
}

void maisim_envia(const char *para, const char *chave, maisim_real valor) {
    (void)para; (void)chave; (void)valor;  /* TODO: mandar pela sua comunicação */
}

int maisim_recebeu(const char *de, const char *chave, maisim_real *valor) {
    (void)de; (void)chave; (void)valor;    /* TODO: 1 e o valor se chegou nesta amostra */
    return 0;
}
