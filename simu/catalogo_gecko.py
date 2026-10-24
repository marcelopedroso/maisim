#!/usr/bin/env python3
"""Catálogo da paleta do GeckoCIRCUITS, tirado do código-fonte (MDPGeckoCIRCUITS): as abas e os componentes de cada uma,
na ordem do Gecko (SchematischeEingabeAuswahl2.initPanels), com o enum, o código numérico gravado no .ipes ("typ"), o
nome curto que a interface remota aceita em createComponent (_fixedIDString) e o nome exibido (I18nKeys, inglês).
uso: python3 simu/catalogo_gecko.py [pasta-do-código-do-GeckoCIRCUITS]  →  grava static/catalogo.json"""
import json
import re
import sys
from pathlib import Path

G = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "gecko/build/GeckoCIRCUITS") / "src/main/java/ch/technokrat/gecko"   # o montado por gecko/construir.sh
FONTES = {p.stem: p for p in G.rglob("*.java")}


def le(nome):
    return FONTES[nome].read_text(errors="replace")


# textos em inglês: KEY("texto") em I18nKeys.java
TEXTOS = dict(re.findall(r'^\s*([A-Z0-9_]+)\("((?:[^"\\]|\\.)*)"', le("I18nKeys"), re.M))
# enums de tipo: NOME(código, Classe.TYPE_INFO | Classe.tinfo …)
TIPOS = {}
for arq, dom in (("CircuitTyp", None), ("ControlTyp", "CONTROL"), ("SpecialTyp", "SPECIAL")):
    for nome, cod, classe in re.findall(r"^\s*([A-Z][A-Za-z0-9_]*)\((-?\d+),\s*([A-Za-z0-9_]+)\.\w+", le(arq), re.M):
        d = dom or ("THERM" if nome.startswith("TH_") else "REL" if nome.startswith(("REL_", "NONLIN_REL")) else "LK")
        TIPOS[nome] = dict(enum=nome, dom=d, typ=int(cod), classe=classe)


def info(classe):
    """(nome curto, chave do nome exibido) do TypeInfo declarado na classe do componente."""
    if classe not in FONTES:
        return None, None
    m = re.search(r'TypeInfo\(\s*\w+\.class\s*,\s*"([^"]*)"\s*,\s*I18nKeys\.([A-Z0-9_]+)', le(classe))
    return (m.group(1), m.group(2)) if m else (None, None)


fonte = le("SchematischeEingabeAuswahl2")
listas = {nome: re.findall(r"(?:\w+Typ\.)?([A-Z][A-Za-z0-9_]+)", corpo)
          for nome, corpo in re.findall(r"(_typ\w+)\s*=\s*new\s+\w+\[\]\s*\{(.*?)\};", fonte, re.S)}
for k, v in listas.items():                                 # tira o que está comentado (/* … */ e // …)
    corpo = re.search(rf"{k}\s*=\s*new\s+\w+\[\]\s*\{{(.*?)\}};", fonte, re.S).group(1)
    corpo = re.sub(r"/\*.*?\*/", "", corpo, flags=re.S)
    corpo = re.sub(r"//[^\n]*", "", corpo)
    listas[k] = re.findall(r"(?:\w+Typ\.)?([A-Z][A-Za-z0-9_]+)", corpo)
abas = []
for var, titulo in re.findall(r'createJPanelForTypes\((_typ\w+),\s*"([^"]+)"\)', fonte):
    itens = []
    for e in listas.get(var, []):
        t = TIPOS.get(e)
        if not t:
            itens.append(dict(enum=e, erro="tipo não achado")); continue   # i18n-ok (script de quem monta o catalogo.json, não da tela)
        ident, chave = info(t["classe"])
        itens.append(dict(t, id=ident, nome=TEXTOS.get(chave, chave or e)))
    abas.append(dict(aba=titulo, itens=itens))
saida = Path(__file__).parent / "static" / "catalogo.json"
saida.write_text(json.dumps(dict(fonte="MDPGeckoCIRCUITS, SchematischeEingabeAuswahl2 + CircuitTyp/ControlTyp/SpecialTyp + I18nKeys",
                                 abas=abas), ensure_ascii=False, indent=1))
n = sum(len(a["itens"]) for a in abas)
sem = [i["enum"] for a in abas for i in a["itens"] if not i.get("id")]
print(f"{len(abas)} abas, {n} itens; sem nome curto: {sem or 'nenhum'}")
for a in abas:
    print(f"  {a['aba']:12} {len(a['itens']):3}: " + ", ".join(f"{i.get('nome')} [{i.get('id')}·{i.get('typ')}]" for i in a["itens"][:5]) + (" …" if len(a["itens"]) > 5 else ""))
