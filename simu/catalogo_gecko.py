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
    # o enum que sobrescreve getTypeNumber() grava no .ipes o código de outro (Data from File e Random Walk: o do Signal
    # Source, 4 — no arquivo são uma fonte de sinal com outro typQuelle): typ é o do arquivo, typ_enum o do enum
    for nome, outro in re.findall(r"^\s*([A-Z][A-Za-z0-9_]*)\(-?\d+,[^)]*\)\s*\{\s*@Override\s*public\s+int\s+getTypeNumber\(\)\s*\{\s*"
                                  r"return\s+([A-Z][A-Za-z0-9_]*)\.getTypeNumber\(\)", le(arq), re.M):
        if outro in TIPOS:
            TIPOS[nome].update(typ=TIPOS[outro]["typ"], typ_enum=TIPOS[nome]["typ"])


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
# o que o MaiSim não oferece na paleta (pedido de Marcelo, 25/10: o que nunca testamos ou não faz sentido aqui), mesmo que o
# Gecko o ponha lá: fica no catalogo.json com "oculto" (o ipes.py ainda dá nome e id a ele, e um circuito que já o tem abre,
# desenha e roda), só a paleta do simu.js não o mostra. TH_MODUL (ThermMODUL, PR #119) lança UnsupportedOperationException.
ESCONDIDOS = {
    "TH_MODUL": "ThermMODUL lança UnsupportedOperationException no Gecko",   # i18n-ok (motivos do script, não da tela)
    "C_TO_EXTERNAL": "ponte com o Simulink, que o MaiSim não usa",   # i18n-ok
    "C_FROM_EXTERNAL": "ponte com o Simulink, que o MaiSim não usa",   # i18n-ok
    "C_DATA_EXPORT": "grava arquivo fora do MaiSim; o scope e as rodadas já exportam",   # i18n-ok
    "C_SOURCE_IMPORT_DATA": "lê um arquivo de dados de fora, sem teste nem exemplo",   # i18n-ok
    "C_JAVA_FUNCTION": "compila código Java dentro do Gecko; o MaiSim tem o controle.py",   # i18n-ok
    "C_NATIVE_C_FUNCTION": "precisa de uma biblioteca C/C++ compilada à parte",   # i18n-ok
    "C_SMALL_SIG": "análise de pequenos sinais do Gecko, fora do caminho do MaiSim",   # i18n-ok
    "C_SPARSEMATRIX": "controle pronto do conversor matricial esparso, específico demais",   # i18n-ok
    "C_PMSM_CONTROL": "controle pronto de PMSM do Gecko, nunca testado",   # i18n-ok
    "C_PMSM_MODULATOR": "modulador pronto de PMSM do Gecko, nunca testado",   # i18n-ok
    # 25/10 (v0.3.1): as janelas do Gecko que o scope já faz (o painel XY: vetor espacial e U–Z·i) e o receptor de EMI
    "C_CISPR16": "receptor de EMI (CISPR 16) do Gecko, sem teste nem exemplo",   # i18n-ok
    "C_SPACE_VECTOR": "janela do Gecko; no MaiSim é o painel XY do scope (vetor espacial)",   # i18n-ok
    "C_U_ZI": "janela do Gecko; no MaiSim é o painel XY do scope (U–Z·i)",   # i18n-ok
    # o domínio de relutância inteiro (a aba Reluctance, os seus medidores e terminais): nenhum exemplo nem teste
    "C_MMFMETER": "medidor de FMM do domínio de relutância",   # i18n-ok
    "C_FLUXMETER": "medidor de fluxo do domínio de relutância",   # i18n-ok
    "REL_RELUCTANCE": "domínio de relutância, sem exemplo nem teste",   # i18n-ok
    "NONLIN_REL": "domínio de relutância, sem exemplo nem teste",   # i18n-ok
    "REL_MMF": "domínio de relutância, sem exemplo nem teste",   # i18n-ok
    "REL_INDUCTOR": "domínio de relutância, sem exemplo nem teste",   # i18n-ok
    "REL_TERMINAL": "terminal de subcircuito do domínio de relutância",   # i18n-ok
    "REL_GLOBAL_TERMINAL": "terminal global do domínio de relutância",   # i18n-ok
    # das máquinas ficam M-DC, PM-DC, PMSM e IM-CAGE (os pinos, o símbolo e os exemplos); LISN: sem teste nem exemplo
    "LK_MOTOR_SMSALIENT": "máquina síncrona de polos salientes, sem pinos nem exemplo no MaiSim",   # i18n-ok
    "LK_MOTOR_SMROUND": "máquina síncrona de rotor liso, sem pinos nem exemplo no MaiSim",   # i18n-ok
    "LK_MOTOR_IMC": "máquina de indução, sem pinos nem exemplo no MaiSim (fica a IM-CAGE)",   # i18n-ok
    "LK_MOTOR_IMSAT": "máquina de indução com saturação, sem pinos nem exemplo no MaiSim",   # i18n-ok
    "LK_LISN": "LISN (a rede de estabilização da medição de EMI), sem teste nem exemplo",   # i18n-ok
}
# o nome na paleta que não é o do Gecko (I18nKeys, só em inglês): "rotulo" é a chave do textos_simu.js (pt e en), e o
# simu.js a mostra no lugar do "nome" (que fica o do Gecko, para a busca e o arquivo)
ROTULOS = {"C_VIEWMOT": "simu.cmp_viewmot"}   # "Machine-Internal": a grandeza de dentro de uma máquina (ω, n, Tel, ia…)
for var, titulo in re.findall(r'createJPanelForTypes\((_typ\w+),\s*"([^"]+)"\)', fonte):
    itens = []
    for e in listas.get(var, []):
        t = TIPOS.get(e)
        if not t:
            itens.append(dict(enum=e, erro="tipo não achado")); continue   # i18n-ok (script de quem monta o catalogo.json, não da tela)
        ident, chave = info(t["classe"])
        itens.append(dict(t, id=ident, nome=TEXTOS.get(chave, chave or e), **({"oculto": True} if e in ESCONDIDOS else {}),
                          **({"rotulo": ROTULOS[e]} if e in ROTULOS else {})))
    abas.append(dict(aba=titulo, itens=itens))
saida = Path(__file__).parent / "static" / "catalogo.json"
saida.write_text(json.dumps(dict(fonte="MDPGeckoCIRCUITS, SchematischeEingabeAuswahl2 + CircuitTyp/ControlTyp/SpecialTyp + I18nKeys",
                                 abas=abas), ensure_ascii=False, indent=1))
n = sum(len(a["itens"]) for a in abas)
sem = [i["enum"] for a in abas for i in a["itens"] if not i.get("id")]
print(f"{len(abas)} abas, {n} itens; sem nome curto: {sem or 'nenhum'}; fora da paleta: "
      f"{[i['enum'] for a in abas for i in a['itens'] if i.get('oculto')] or 'nenhum'}")
for a in abas:
    print(f"  {a['aba']:12} {len(a['itens']):3}: " + ", ".join(f"{i.get('nome')} [{i.get('id')}·{i.get('typ')}]" for i in a["itens"][:5]) + (" …" if len(a["itens"]) > 5 else ""))
