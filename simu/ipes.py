"""Leitor de .ipes (GeckoCIRCUITS) para o desenho do circuito no /maisim/simu: folhas (a principal e a de cada
subcircuito), elementos com tipo, posição, orientação, parâmetros e terminais, e fios. Coordenadas na grade do Gecko.

Regras do Gecko (código em MDPGeckoCIRCUITS, ch.technokrat.gecko.geckocircuits.circuit):
- orientação (ComponentDirection): 503 norte→sul, 501 sul→norte, 502 oeste→leste, 504 leste→oeste;
- elemento de dois pinos (TerminalTwoPortComponent): terminais no centro ± 2 na direção da orientação;
- bloco de controle (TerminalRelativePosition, orientação 503): entrada i em (x − d_e, y + i), saída j em (x + d_s, y + j);
  d_e e d_s dependem do tipo de bloco (1 a 4; AND, NOT e DELAY têm saída em x + 1); aqui, a menor distância em que os
  terminais encostam numa ponta de fio (sem fio, 2);
- fio de um ponto só é sobra do editor e fica de fora; ponta solta de fio com rótulo é ligação por rótulo (vale no Gecko);
- variáveis globais (Tools > Parameters): optimizerName[] / optimizerValue[]; um parâmetro ligado a uma variável ($La …)
  vale o da variável, que é o que o Gecko mostra e usa; o valor guardado no próprio elemento pode estar velho.
- subcircuito (SubcircuitBlock): retângulo de (x − ½, y − ½) com blockSizeX × blockSizeY; cada terminal da folha de
  dentro diz o lado (EnumTerminalLocation: 0 cima, 1 esquerda, 2 direita, 3 baixo) e a posição vira proporcional
  (ex.: esquerda → (−1, ⌊blockSizeY · y_dentro / worksheetSizeY⌋)).
"""
import gzip
import json
import re
from collections import Counter
from pathlib import Path

LK = {1: "R", 2: "L", 3: "C", 4: "U", 5: "I", 6: "D", 7: "S", 8: "THYR", 9: "MOSFET", 10: "IGBT", 29: "TERM"}
CONTROL = {1: "VOLT", 2: "AMP", 3: "CONST", 4: "SIGNAL", 5: "SCOPE", 6: "GATE", 7: "GAIN", 12: "ADD", 13: "SUB",
           18: "NOT", 19: "AND", 25: "DELAY", 45: "GE", 78: "TERM"}
DOIS_PINOS = {"R", "L", "C", "U", "I", "D", "S", "IGBT", "MOSFET", "THYR"}
# catálogo da paleta (catalogo_gecko.py): (família do enum, código) → nome curto e nome exibido; LK, THERM e REL
# compartilham o enum CircuitTyp, CONTROL é o ControlTyp, SPECIAL o SpecialTyp
FAMILIA = {"LK": "C", "THERM": "C", "REL": "C", "RELUCTANCE": "C", "CONTROL": "K", "SPECIAL": "S"}
CATALOGO = {}
try:
    for _a in json.loads((Path(__file__).parent / "static" / "catalogo.json").read_text())["abas"]:
        for _i in _a["itens"]:
            CATALOGO[(FAMILIA.get(_i["dom"], _i["dom"]), _i["typ"])] = (_i["id"], _i["nome"])
except (OSError, ValueError, KeyError):
    pass
# geometria dos terminais tirada do próprio Gecko (motor/src/maisim/MaiSimGeometria.java → geometria_gecko.json): por id do tipo,
# (_posX, _posY) crus de cada entrada e saída; o ponto na folha é a conta de TerminalRelativePosition.getPointFromDirection
GEOMETRIA = {}
try:
    GEOMETRIA = {g["id"]: g for g in json.loads((Path(__file__).parent / "geometria_gecko.json").read_text()) if "erro" not in g}
except (OSError, ValueError, KeyError):
    pass


# as entradas que o bloco ganha com useExternal (setExpanded do Gecko; a tabela acima é a do bloco recém-criado, sem elas):
# SIGNAL (ReglerSignalSource): TerminalControlInput(this, -1, -XIN.size() - 2) → as 5 em (x − 1, y + 2 … y + 6), na ordem do
# SignalCalculatorExternalWrapper (amplitude, f, offset, fase, d); LIMIT: (-1, -XIN.size() - 1) → min e max em y + 2, y + 3;
# HYS: (-1, -2) → h em y + 2
EXTERNAS = {"SIGNAL": [(-1, -2), (-1, -3), (-1, -4), (-1, -5), (-1, -6)], "LIMIT": [(-2, 0), (-1, -2), (-1, -3)], "HYS": [(-2, 0), (-1, -2)]}


def ponto_gecko(e, px, py):
    """Ponto na folha de um terminal com posição relativa (px, py), na orientação do elemento (como o Gecko calcula)."""
    x, y, d = e["x"], e["y"], e["dir"]
    return {504: (x + py, y + px), 501: (x - px, y + py), 502: (x - py, y - px)}.get(d, (x + px, y - py))


def _relativos(lista, n):
    """As n posições relativas: as da tabela e, se o bloco tem mais terminais (soma com 3 entradas…), o mesmo passo das últimas."""
    out = [tuple(p) for p in lista[:n]]
    while len(out) < n:
        if len(out) >= 2:
            (a, b), (c, d) = out[-2], out[-1]
            out.append((2 * c - a, 2 * d - b))
        elif out:
            out.append((out[-1][0], out[-1][1] - 1))
        else:
            out.append((0, -len(out)))
    return out


# parâmetros com nome legível no .ipes (o resto fica de fora do desenho)
NOMES = ["resistance", "inductance", "capacitance", "initialCurrent", "initialValue", "amplitude", "frequency", "phaseDegrees",
         "dcValue", "offset", "onResistance", "offResistance", "constantValue", "k", "typQuelle", "amplitudeAC", "frequenz",
         "anteilDC", "phase", "tastverhaeltnis", "uForward", "rOn", "rOff", "delayTime", "blockSizeX", "blockSizeY",
         "worksheetSizeX", "worksheetSizeY", "terminalLocation", "sourceType"]


def _rotulos(v):
    """'/a/NIX_NIX_NIX/b' → ['a', '', 'b']; vazio → []."""
    v = (v or "").strip()
    return [] if not v else ["" if r == "NIX_NIX_NIX" else r for r in v.split("/")[1:]]


def le(caminho):
    t = gzip.open(caminho, "rt", errors="replace").read() if open(caminho, "rb").read(2) == b"\x1f\x8b" \
        else open(caminho, errors="replace").read()
    t = t.replace("\r", "")
    elementos, fios = [], []
    nomes = re.search(r"\noptimizerName\[\] ([^\n]*)", t)
    valores = re.search(r"\noptimizerValue\[\] ([^\n]*)", t)
    globais = {}
    if nomes and valores:
        for n, v in zip(nomes.group(1).strip().split("/")[1:], valores.group(1).split()):
            try:
                globais[n] = float(v)
            except ValueError:
                pass
    for pref, tag, corpo in re.findall(r"\n(\w+) \(\d+\)\n<(Element\w+)>\n(.*?)<\\\2>", t, re.S):
        d = {}
        for linha in corpo.split("\n"):
            if " " in linha:
                k, v = linha.split(" ", 1)
                d.setdefault(k, v)
        dom = tag[len("Element"):]                  # LK, CONTROL, SPECIAL, THERM …
        typ = int(d.get("typ", -1))
        cat = CATALOGO.get((FAMILIA.get(dom, dom), typ), (None, None))
        tipo = (LK if dom == "LK" else CONTROL if dom == "CONTROL" else {27: "SUBCIRCUIT"} if dom == "SPECIAL" else {}).get(typ) \
            or cat[0] or f"{dom}{typ}"
        par = {}
        for k in NOMES:
            if k in d:
                try:
                    par[k] = float(d[k])
                except ValueError:
                    pass
        for k, v in d.items():                      # nome do parâmetro ($Lf …), quando o valor vem de uma variável
            if k.endswith("$ParameterName") and v.strip() not in ("", "NIX_NIX_NIX"):
                base, var = k.split("$")[0], v.strip()
                par[base + "_var"] = var
                if var in globais:                  # vale o da variável global (o do elemento pode estar velho)
                    if base in par and par[base] != globais[var]:
                        par[base + "_guardado"] = par[base]
                    par[base] = globais[var]
        elementos.append(dict(dom=dom, typ=typ, tipo=tipo, nome=d.get("idStringDialog", "?"), x=int(d.get("x", 0)),
                              y=int(d.get("y", 0)), dir=int(d.get("orientierung", 503)), folha=d.get("parentSheetIdentifier", "0"),
                              uid=d.get("uniqueObjectIdentifier", ""), entradas=_rotulos(d.get("labelAnfangsKnoten[]")),
                              saidas=_rotulos(d.get("labelEndKnoten[]")), mede=_rotulos(d.get("parameterString[]"))[:2],
                              txt=[float(d.get("dxTxt", 0) or 0), float(d.get("dyTxt", 0) or 0)], par=par,
                              id_gecko=cat[0], nome_tipo=cat[1], ativo=d.get("enabledShorted", "1").strip() == "1",
                              curto=d.get("enabledShorted", "1").strip() == "2", bruto=_bruto(corpo, d)))   # Gecko: 0 desativado, 1 ativo, 2 em curto
    for dom, corpo in re.findall(r"\nverbindung(\w+)\s+\(\d+\)\n<Verbindung>\n(.*?)<\\Verbindung>", t, re.S):
        d = dict(l.split(" ", 1) for l in corpo.split("\n") if " " in l)
        xs, ys = list(map(int, d.get("x[]", "").split())), list(map(int, d.get("y[]", "").split()))
        rot = d.get("label", "NIX_NIX_NIX").strip()
        if len(xs) < 2:                                 # sobra do editor (fio de um ponto)
            continue
        fios.append(dict(dom=dom, pts=list(zip(xs, ys)), rotulo="" if rot == "NIX_NIX_NIX" else rot,
                         folha=d.get("parentSheetIdentifier", "0").strip()))
    sim = {}                                            # Δt e tempo final guardados no arquivo (os da última rodada no Gecko)
    for chave, campo in (("dt", "dt"), ("tDURATION", "tfim")):
        m = re.search(rf"\n{chave} ([^\n]+)", t)
        try:
            sim[campo] = float(m.group(1)) if m else None
        except ValueError:
            sim[campo] = None
    # as variáveis globais e o Δt/tempo final voltam junto (não como atributo da função: duas leituras ao mesmo tempo, nos
    # pedidos simultâneos do servidor, trocariam os de um modelo pelos de outro)
    return elementos, fios, dict(globais=globais, simulacao=sim if all(v and v > 0 for v in sim.values()) else {})


def _dois_pinos(e):
    x, y, s = e["x"], e["y"], {503: (0, 1), 501: (0, -1), 502: (1, 0), 504: (-1, 0)}.get(e["dir"], (0, 1))
    return [(x - 2 * s[0], y - 2 * s[1]), (x + 2 * s[0], y + 2 * s[1])]


# o que o Gecko muda sozinho ao regravar um modelo sem edição (medido em 18/10 nos modelos 01, 03 e no exemplo do buck):
# o vetor parameter[] (estados internos da simulação), as janelas de scope dele e os valores de campos ligados a variáveis
# globais (a variável é comparada à parte); e os desenhos de texto (dx/dyTxt) não são do circuito
VOLATEIS = ("parameter[]", "saveScreen", "savedSignalNames", "dxTxt", "dyTxt")


def _bruto(corpo, d):
    """Todas as linhas do bloco do elemento, menos as voláteis: é o que a comparação "Gecko × arquivo" (mudanças não
    salvas) usa — enxerga qualquer campo (tensão inicial, queda do diodo, limites, o que o medidor mede, desativado…)."""
    ligados = {k.split("$")[0] for k, v in d.items() if k.endswith("$ParameterName") and v.strip() not in ("", "NIX_NIX_NIX")}
    return tuple(sorted(x.rstrip() for x in corpo.split("\n") if x.strip() and not x.startswith(VOLATEIS)
                        and x.split(" ", 1)[0] not in ligados))


def monta(caminho):
    """Folhas prontas para desenhar: {"folhas": {id: {"nome", "tamanho", "elementos", "fios"}}, "principal": "0", "encaixe": …}."""
    elementos, fios, extra = le(caminho)
    por_folha = {}
    for e in elementos:
        por_folha.setdefault(e["folha"], []).append(e)
    pontas = Counter()                                  # (folha, x, y) das pontas de fio
    for f in fios:
        if f["pts"]:
            pontas[(f["folha"],) + tuple(f["pts"][0])] += 1
            pontas[(f["folha"],) + tuple(f["pts"][-1])] += 1
    subs = {e["uid"]: e for e in elementos if e["tipo"] == "SUBCIRCUIT"}
    for e in elementos:
        term = []
        if e["dom"] == "LK" and e["tipo"] in DOIS_PINOS:
            term = [dict(x=px, y=py, rotulo=r) for (px, py), r in zip(_dois_pinos(e), (e["entradas"] + [""])[:1] + (e["saidas"] + [""])[:1])]
        elif e["tipo"] == "TERM":
            term = [dict(x=e["x"], y=e["y"], rotulo="")]
        elif e["dom"] == "CONTROL" and e.get("id_gecko") in GEOMETRIA and e["tipo"] != "TERM":   # onde o Gecko põe
            geo, ne, ns = GEOMETRIA[e["id_gecko"]], len(e["entradas"]), len(e["saidas"])
            ext = EXTERNAS.get(e["id_gecko"])
            rel_e = ext if ext and ne == len(ext) and ne > len(geo["entradas"]) else _relativos(geo["entradas"], ne)
            term = [dict(zip(("x", "y"), ponto_gecko(e, *pr)), rotulo=r, lado="e") for pr, r in zip(rel_e, e["entradas"])] + \
                   [dict(zip(("x", "y"), ponto_gecko(e, *pr)), rotulo=r, lado="s") for pr, r in zip(_relativos(geo["saidas"], ns), e["saidas"])]
            e["d_entrada"] = abs(rel_e[0][0]) if ne else None
            e["d_saida"] = abs(_relativos(geo["saidas"], 1)[0][0]) if ns else None
            e["geometria"] = "gecko"
        elif e["dom"] == "CONTROL":                          # sem geometria na tabela: o palpite pelas pontas das conexões
            ne, ns = len(e["entradas"]), len(e["saidas"])
            def melhor(lado, n):                        # distância do terminal que mais encaixa nas pontas de fio
                for d in (1, 2, 3, 4):
                    if any(pontas[(e["folha"], e["x"] + lado * d, e["y"] + i)] for i in range(n)):
                        return d
                return 2
            de, ds = melhor(-1, ne), melhor(1, ns)
            term = [dict(x=e["x"] - de, y=e["y"] + i, rotulo=r, lado="e") for i, r in enumerate(e["entradas"])] + \
                   [dict(x=e["x"] + ds, y=e["y"] + j, rotulo=r, lado="s") for j, r in enumerate(e["saidas"])]
            e["d_entrada"], e["d_saida"] = de, ds
        elif e["tipo"] == "SUBCIRCUIT":
            bx, by = int(e["par"].get("blockSizeX", 6)), int(e["par"].get("blockSizeY", 3))
            sx, sy = e["par"].get("worksheetSizeX", 60), e["par"].get("worksheetSizeY", 20)
            dentro = [t for t in por_folha.get(e["uid"], []) if t["tipo"] == "TERM"]
            ext = e["entradas"]
            for k, t in enumerate(dentro):
                lado = int(t["par"].get("terminalLocation", 1))
                if lado == 0:
                    rx, ry = int(bx * t["x"] / sx), -1
                elif lado == 3:
                    rx, ry = int(bx * t["x"] / sx), by
                elif lado == 1:
                    rx, ry = -1, int(by * t["y"] / sy)
                else:
                    rx, ry = bx, int(by * t["y"] / sy)
                term.append(dict(x=e["x"] + rx, y=e["y"] + ry, rotulo=ext[k] if k < len(ext) else "", interno=t["nome"],
                                 lado="cedb"[lado], dom=t["dom"]))
            for t in term:                              # dois terminais de dentro no mesmo borne (o Gecko deixa; a tela avisa)
                outros = [u["interno"] for u in term if u is not t and (u["x"], u["y"]) == (t["x"], t["y"])]
                if outros:
                    t["junto"] = outros
            e["tamanho"] = [bx, by]
        e["terminais"] = term
    folhas = {}
    # a principal sempre; e a de todo SM, mesmo vazio (um subcircuito recém-criado: a tela precisa entrar nele para pôr o
    # primeiro terminal)
    for fid in sorted(set(por_folha) | {f["folha"] for f in fios} | {"0"} | set(subs), key=lambda s: (s != "0", s)):
        els = por_folha.get(fid, [])
        fs = [f for f in fios if f["folha"] == fid]
        xs = [p[0] for f in fs for p in f["pts"]] + [e["x"] for e in els]
        ys = [p[1] for f in fs for p in f["pts"]] + [e["y"] for e in els]
        nome = "principal" if fid == "0" else subs.get(fid, {}).get("nome", fid)
        folhas[fid] = dict(nome=nome, elementos=els, fios=fs,
                           limites=[min(xs, default=0), min(ys, default=0), max(xs, default=10), max(ys, default=10)])
        if fid in subs:                                  # a folha de um SM tem tamanho fixo (o Gecko encosta na borda o que passa dela)
            par = subs[fid]["par"]
            folhas[fid]["tamanho"] = [int(par.get("worksheetSizeX", 60)), int(par.get("worksheetSizeY", 20))]
    # encaixe: pontas de fio que caem num terminal ou noutro fio (conferência do desenho)
    alvo = {}
    for e in elementos:
        for tm in e["terminais"]:
            alvo[(e["folha"], tm["x"], tm["y"])] = True
    pts_fio = Counter((f["folha"],) + tuple(p) for f in fios for p in f["pts"])
    tot = ok_term = ok_fio = ok_rot = 0
    soltas = []
    for f in fios:
        for p in f["pts"][:1] + f["pts"][-1:]:
            tot += 1
            chave = (f["folha"],) + tuple(p)
            if chave in alvo:
                ok_term += 1
            elif pts_fio[chave] > 1:
                ok_fio += 1
            elif f["rotulo"]:
                ok_rot += 1
            else:
                soltas.append(list(chave))
    return dict(folhas=folhas, principal="0", globais=extra["globais"], simulacao=extra["simulacao"], encaixe=dict(pontas=tot, em_terminal=ok_term, em_outro_fio=ok_fio,
                                                           soltas_com_rotulo=ok_rot, soltas=soltas))


if __name__ == "__main__":
    import json
    import sys
    r = monta(sys.argv[1])
    p = r["folhas"]["0"]
    print(json.dumps(r["encaixe"]), "| folhas:", len(r["folhas"]), "| principal:", len(p["elementos"]), "elementos,", len(p["fios"]), "fios",
          "| limites", p["limites"])
    print(Counter(e["tipo"] for e in p["elementos"]))
    print("blocos de controle (d_e, d_s):", Counter((e["tipo"], e.get("d_entrada"), e.get("d_saida")) for e in p["elementos"] if e["dom"] == "CONTROL"))
    sub = [e for e in p["elementos"] if e["tipo"] == "SUBCIRCUIT"][0]
    print("SUBCIRCUIT.1:", sub["x"], sub["y"], sub["tamanho"], [(t["interno"], t["x"], t["y"], t["rotulo"]) for t in sub["terminais"]])
