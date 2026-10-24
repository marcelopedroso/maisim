"""Os textos do servidor do simu, em português e inglês, lado a lado (o MaiSim bilíngue, 24/10/2026). Usados por
lingua.tr("chave", **params) no idioma do pedido. Ver config/lingua.py e CONTRIBUTING.md."""
import lingua

T = {
    # salvar por cima: o servidor pede confirmação (a página confere o código "confirmar", não o texto)
    "editor.sobrescrever": {"pt": "já existe {arq}; confirme para sobrescrever", "en": "{arq} already exists; confirm to overwrite"},
    "editor.sobrescrever_pergunta": {"pt": "já existe {arq}.", "en": "{arq} already exists."},
    "biblioteca.sobrescrever": {"pt": "já existe {nome} na biblioteca; confirme para sobrescrever",
                                "en": "{nome} already exists in the library; confirm to overwrite"},
    "biblioteca.sobrescrever_pergunta": {"pt": "já existe {nome} na biblioteca.", "en": "{nome} already exists in the library."},
}

lingua.registra(T)
