"""Os textos do servidor do scope, em português e inglês, lado a lado (o MaiSim bilíngue, 24/10/2026). Usados por
lingua.tr("chave", **params) no idioma do pedido. Não se chama textos.py: o simu/servidor.py põe o scope/ no sys.path (o
publica.py) e o textos do simu é outro. Ver config/lingua.py e CONTRIBUTING.md."""
import lingua

T = {
    # as respostas de erro das rotas
    "scope_srv.nao_achei": {"pt": "não achei", "en": "not found"},
    "scope_srv.arquivo_invalido": {"pt": "arquivo inválido", "en": "invalid file"},
    "scope_srv.rota_desconhecida": {"pt": "rota desconhecida", "en": "unknown route"},
    # apagar gravações: por que uma ficou (o "por" de cada recusada; o "codigo" ao lado não muda com o idioma)
    "scope_srv.nao_gravacao": {"pt": "não é uma gravação do scope", "en": "not a scope recording"},
    "scope_srv.rodando": {"pt": "está rodando", "en": "running"},
    "scope_srv.guardada": {"pt": "guardada", "en": "kept"},
    # o nome de uma rodada gravada na lista (planta · circuito · pasta · data e hora · intervalo)
    "scope_srv.planta_python": {"pt": "planta Python", "en": "Python plant"},
    "scope_srv.quando": {"pt": "{dia}/{mes} {hora}:{min}", "en": "{mes}/{dia} {hora}:{min}"},
    # o módulo Figuras (figura.py)
    "figura.sem_matplotlib": {"pt": "as figuras para artigo usam o matplotlib, que não está instalado (na versão de programador: pip install matplotlib)",
                              "en": "the paper figures use matplotlib, which is not installed (in the developer version: pip install matplotlib)"},
    "figura.formato": {"pt": "formato desconhecido: {formato}", "en": "unknown format: {formato}"},
    "figura.sem_sinais": {"pt": "escolha pelo menos um sinal num painel", "en": "choose at least one signal in a panel"},
    "figura.janela": {"pt": "a janela de tempo está vazia (o fim tem de vir depois do começo)", "en": "the time window is empty (the end must come after the start)"},
    "figura.sem_tempo": {"pt": "a gravação não tem o tempo (t)", "en": "the recording has no time (t)"},
    "figura.so_maisim": {"pt": "só a página do MaiSim gera figuras", "en": "only the MaiSim page makes figures"},
}

lingua.registra(T)
