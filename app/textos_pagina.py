"""Os textos da página do MaiSim (app/pagina.py), em português e inglês, lado a lado (o MaiSim bilíngue). Usados por
lingua.tr("chave", **params) no idioma da página (o cookie maisim-lingua do pedido). Ver config/lingua.py e CONTRIBUTING.md."""
import lingua

T = {
    # as respostas da página quando o módulo de destino não está no ar
    "pagina.sem_modulo": {"pt": "MaiSim: o módulo da porta {porta} não está no ar", "en": "MaiSim: the module on port {porta} is not running"},
    "pagina.tela_desligada": {"pt": "MaiSim: a tela do Gecko está desligada (MAISIM_TELA_GECKO=1 no .env liga, depois de reiniciar)",
                              "en": "MaiSim: the Gecko screen is off (MAISIM_TELA_GECKO=1 in .env turns it on, after a restart)"},
}

lingua.registra(T)
