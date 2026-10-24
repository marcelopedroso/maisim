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
    "scope_srv.rodando": {"pt": "está rodando", "en": "is running"},
    "scope_srv.guardada": {"pt": "guardada", "en": "kept"},
    # o nome de uma rodada gravada na lista (planta · circuito · pasta · data e hora · intervalo)
    "scope_srv.planta_python": {"pt": "planta Python", "en": "Python plant"},
    "scope_srv.quando": {"pt": "{dia}/{mes} {hora}:{min}", "en": "{mes}/{dia} {hora}:{min}"},
}

lingua.registra(T)
