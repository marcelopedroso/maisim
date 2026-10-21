"""Vários controladores (passo 1 do controle distribuído), na instância de teste (7201), com o PI de corrente do exemplo
(exemplo_controle_pi, congelado em dados/). A prova é de equivalência: aquisição + controle em processos separados, que
calculam juntos e conversam pela rede, têm de dar EXATAMENTE o mesmo que um controlador único que usa a medida de D
amostras atrás (D = 1 com latência 0; D = 3 com latência 2,5·Ts). E: isolamento (um não vê a memória do outro), paralelo
(dois de 0,3 s levam ~0,3 s por amostra), visão local (ler medida de outro ou escrever atuação de outro é erro, com
arquivo e linha), dono único da atuação, salvar e abrir de novo, os arquivos na pasta da rodada, e um controlador por
subcircuito na cascata do exemplo com os nomes sem o prefixo."""
import json, os, time, urllib.request
from pathlib import Path
import numpy as np
RAIZ_PROJ = str(Path(__file__).resolve().parents[2])   # a raiz do projeto (validacao → simu → raiz)
B = "http://localhost:7201/maisim/simu/"
T = os.path.expanduser("~/.cache/maisim_teste")
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)

PI = f"{T}/circuitos/exemplo_controle_pi.ipes"
r = api("editor/abrir", {"arq": PI, "modo": "descartar"})
base = api("editor/controle")["controle"]
Ts = base["Ts"]
def caminho(j):                                      # o .npz da rodada (o servidor devolve relativo à raiz do repositório)
    return j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
def roda2(nome, cfg):
    g = api("editor/controle", {"controle": cfg})
    if "ERRO" in g: return {"estado": "erro", "erro": g.get("erro")}, None
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.03", "nome": nome, "amostras": "100000"})
    while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
    return j, (dict(np.load(caminho(j), allow_pickle=True)) if j.get("estado") == "fim" else None)

# o PI com a medida de D amostras atrás (fila), num controlador só
def atrasado(D):
    return base["codigo"].replace('''def iniciar(p, e):
    e["integral"] = 0.0''', f'''def iniciar(p, e):
    e["integral"] = 0.0
    e["fila"] = [0.0] * {D}''').replace('''    erro = p["i_ref"] - m["i_L"]''', '''    e["fila"].append(m["i_L"])
    erro = p["i_ref"] - e["fila"].pop(0)''')
AQ = '''def passo(t, m, p, e):
    envia("controle", {"i": m["i_L"]})
'''
CTL = base["codigo"].replace('''def iniciar(p, e):
    e["integral"] = 0.0''', '''def iniciar(p, e):
    e["integral"] = 0.0
    e["i"] = 0.0''').replace('''    erro = p["i_ref"] - m["i_L"]''', '''    for msg in recebe():
        e["i"] = msg["dados"]["i"]
    erro = p["i_ref"] - e["i"]''')
ok("e[\"fila\"]" in atrasado(1) and "recebe()" in CTL, "códigos montados a partir do exemplo (o PI e o anti-windup são os mesmos)")
dist = lambda lat: dict(base, codigo=CTL, arquivos={"aquisicao.py": AQ}, rede={"latencia": lat}, controladores=[
    {"nome": "aquisicao", "arquivo": "aquisicao.py", "medidas": ["i_L"], "atuacoes": [], "subcircuitos": []},
    {"nome": "controle", "arquivo": "controle.py", "medidas": [], "atuacoes": ["u_ctrl"], "subcircuitos": []}])
for D, lat in ((1, 0.0), (3, 2.5 * Ts)):
    j1, a = roda2(f"um_atrasado_{D}", dict(base, codigo=atrasado(D)))
    j2, b = roda2(f"aq_controle_{D}", dist(lat))
    # a última amostra do arquivo é a medida final, sem passo do controle: as colunas do scope() vêm NaN nela (nos dois)
    iguais = a is not None and b is not None and np.array_equal(a["i_L"], b["i_L"]) and np.array_equal(a["erro"], b["erro"], equal_nan=True)   # o controle.py: os nomes de sempre no scope
    dif = float(np.max(np.abs(a["i_L"] - b["i_L"]))) if a is not None and b is not None else None
    ok(iguais, f"latência {lat / Ts:g}·Ts: aquisição + controle ≡ controlador único com a medida de {D} amostra(s) atrás — i_L idêntica "
               f"({len(a['i_L']) if a is not None else '?'} amostras, diferença máxima {dif}) {j2.get('erro', '')}")
    if D == 1:
        pasta = os.path.dirname(caminho(j2))
        ok(sorted(x for x in os.listdir(pasta) if x.endswith(".py")) == ["aquisicao.py", "controle.py"], f"a pasta da rodada guarda os dois arquivos: {sorted(os.listdir(pasta))}")
        meta = json.loads(str(b["meta"])) if "meta" in b else {}
        ok([c["nome"] for c in meta.get("controle", {}).get("controladores", [])] == ["aquisicao", "controle"], "o meta da rodada diz os controladores e a rede")
# e o sem atraso não é igual (o teste distingue): o controlador único do exemplo, com a medida da própria amostra
j0, c0 = roda2("um_sem_atraso", base)
ok(c0 is not None and b is not None and not np.array_equal(c0["i_L"], b["i_L"]), "o controlador único sem atraso dá outra curva (a comparação distingue)")

# sem Gecko (o "testar" do painel): isolamento, paralelo, visão local, dono único
testa = lambda cfg: (api("editor/controle", {"controle": cfg}), api("editor/controle/testar", {"dt": 1e-6}))[1]
A = 'def passo(t, m, p, e):\n    math.segredo = 42\n    scope("pus", 1)\n'
Bv = 'def passo(t, m, p, e):\n    scope("viu", 1 if hasattr(math, "segredo") else 0)\n'
dois = lambda a, b, **kw: dict(base, codigo=a, arquivos={"b.py": b}, controladores=[
    {"nome": "a", "arquivo": "controle.py", "medidas": kw.get("ma", []), "atuacoes": kw.get("aa", ["u_ctrl"]), "subcircuitos": []},
    {"nome": "b", "arquivo": "b.py", "medidas": kw.get("mb", []), "atuacoes": kw.get("ab", []), "subcircuitos": []}])
t = testa(dois(A, Bv))
ok(t.get("ok") and all(q["s"].get("a_pus") == 1 and q["s"].get("b_viu") == 0 for q in t["passos"]), f"isolados: o que um pendura no math o outro não vê ({[q['s'] for q in t.get('passos', [])]})")
D3 = 'import time\ndef passo(t, m, p, e):\n    time.sleep(0.3)\n'
t0 = time.time(); t = testa(dois(D3, D3)); dur = time.time() - t0
ok(t.get("ok") and dur < 1.5, f"em paralelo: 2 controladores de 0,3 s, 3 amostras: {dur:.2f} s (em série seria 1,8 s; inclui abrir os processos)")
# o cartão segue o código (19/10): ler m["i_L"] põe i_L no cartão; escrever {"u_ctrl": …} faz do b o dono (sai do a, que só
# o tinha marcado à mão). Por fora do que o código mostra (um nome montado na hora), a visão local continua barrando
g = api("editor/controle", {"controle": dois('def passo(t, m, p, e):\n    return {"u_ctrl": m["i_L"]}\n', 'def passo(t, m, p, e):\n    pass\n')})
ok(g["controle"]["controladores"][0]["medidas"] == ["i_L"] and not g.get("erros_controladores"), f"ler m[\"i_L\"] sem marcar: o cartão do a passa a ler {g['controle']['controladores'][0]['medidas']}")
t = testa(dois('def passo(t, m, p, e):\n    return {"u_ctrl": m["i_" + "L"]}\n', 'def passo(t, m, p, e):\n    pass\n'))
ok(not t.get("ok") and t.get("arquivo") == "controle.py" and t.get("linha") == 2 and "não é medida deste controlador" in t.get("erro", ""),
   f"ler medida que não é sua (nome montado na hora): erro em {t.get('arquivo')} linha {t.get('linha')} ({t.get('erro', '')[:80]}…)")
g = api("editor/controle", {"controle": dois('def passo(t, m, p, e):\n    return {}\n', 'def passo(t, m, p, e):\n    return {"u_ctrl": 1}\n')})
cs = g["controle"]["controladores"]
ok(cs[0]["atuacoes"] == [] and cs[1]["atuacoes"] == ["u_ctrl"] and not g.get("erros_controladores"), f"o código do b escreve u_ctrl: o b é o dono (a: {cs[0]['atuacoes']}, b: {cs[1]['atuacoes']})")
t = testa(dois('def passo(t, m, p, e):\n    return {}\n', 'def passo(t, m, p, e):\n    k = "u_" + "ctrl"\n    return {k: 1}\n'))
ok(not t.get("ok") and "não é atuação deste controlador" in t.get("erro", "") and "(b)" in t.get("erro", ""), f"escrever atuação de outro (chave montada na hora): erro ({t.get('erro', '')[:90]}…)")
g = api("editor/controle", {"controle": dois('def passo(t, m, p, e):\n    return {}\n', 'def passo(t, m, p, e):\n    return {}\n', ab=["u_ctrl"])})
j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.001", "nome": "dois_donos", "amostras": "100"})
ok("ERRO" in j and "dois controladores" in j.get("erro", "") and any("dois controladores" in a for a in g.get("avisos", [])),
   f"a mesma atuação em dois controladores: o painel avisa e a rodada não começa ({j.get('erro', '')[:80]})")
t = testa(dois('def passo(t, m, p, e):\n    envia("c", {"x": 1})\n', 'def passo(t, m, p, e):\n    pass\n'))
ok(not t.get("ok") and "envia(): não há o controlador 'c'" in t.get("erro", "") and t.get("linha") == 2, f"envia para quem não existe: erro na linha ({t.get('erro', '')[:70]})")
# os valores da mensagem (Marcelo, 19/10: a estratégia manda fasores; o envia só aceitava número): número, None e lista
A2 = 'def passo(t, m, p, e):\n    envia("b", {"f": (1.5, -2.0), "n": None, "x": 3})\n'
B2 = ('def passo(t, m, p, e):\n    for msg in recebe():\n        re, im = msg["dados"]["f"]\n        scope("re", re)\n        scope("im", im)\n'
      '        scope("nada", 1 if msg["dados"]["n"] is None else 0)\n        scope("x", msg["dados"]["x"])\n')
t = testa(dois(A2, B2))
ult = t.get("passos", [{}])[-1].get("s", {}) if t.get("ok") else {}
ok(t.get("ok") and (ult.get("b_re"), ult.get("b_im"), ult.get("b_nada"), ult.get("b_x")) == (1.5, -2.0, 1, 3.0),
   f"mensagem com fasor (re, im), None e número: chega {[ult.get(k) for k in ('b_re', 'b_im', 'b_nada', 'b_x')]} {t.get('erro', '')[:80]}")
t = testa(dois('def passo(t, m, p, e):\n    envia("b", {"s": "texto"})\n', 'def passo(t, m, p, e):\n    pass\n'))
ok(not t.get("ok") and "cada valor é um número, None ou uma lista de números" in t.get("erro", ""), f"texto na mensagem: erro claro ({t.get('erro', '')[:90]})")

# salvar e abrir de novo: os arquivos e os controladores vão junto (.controle.json)
api("editor/controle", {"controle": dist(0.0)})
sv = api("editor/salvar", {"nome": "teste_controladores", "sobrescrever": True})
api("editor/novo", {"modo": "descartar"})
api("editor/abrir", {"arq": f"{T}/circuitos/teste_controladores.ipes", "modo": "descartar"})
c2 = api("editor/controle")["controle"]
ok(c2.get("arquivos", {}).get("aquisicao.py") == AQ and [q["nome"] for q in c2.get("controladores", [])] == ["aquisicao", "controle"],
   f"salvo e aberto de novo: arquivos {list(c2.get('arquivos', {}))}, controladores {[q['nome'] for q in c2.get('controladores', [])]}")
for x in ("teste_controladores.ipes", "teste_controladores.controle.json"):
    try: os.remove(f"{T}/circuitos/{x}")
    except OSError: pass

# um controlador por subcircuito na cascata (exemplo, só lendo): cada instância vê vCSm (sem o prefixo) e o p["subcircuito"]
api("editor/abrir", {"arq": "exemplos/exemplo_cascata_hb.ipes", "modo": "descartar"})
pn = api("editor/controle")
subs = sorted({f["nome"] for k, f in api("editor/estado")["folhas"].items() if k != "0"})
SM = 'def passo(t, m, p, e):\n    scope("v", m["vCSm"])\n    scope("eu", float(p["subcircuito"].split(".")[-1]))\n'
cfg = dict(pn["controle"], ativo=True, codigo='def passo(t, m, p, e):\n    return {}\n', arquivos={"sm.py": SM}, controladores=[
    {"nome": "sm", "arquivo": "sm.py", "medidas": [], "atuacoes": [], "subcircuitos": subs}])
g = api("editor/controle", {"controle": cfg})
insts = {i["nome"]: i["medidas"] for i in g.get("instancias", [])}
ok(len(insts) == len(subs) and all("vCSm" in v for v in insts.values()), f"{len(subs)} subcircuitos → instâncias {list(insts)}, cada uma com vCSm entre as medidas")
j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.002", "nome": "sm_por_sub", "amostras": "100000"})
while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
d = dict(np.load(caminho(j), allow_pickle=True)) if j.get("estado") == "fim" else {}
pares = [(f"{i}_v", f"{i[len('sm_'):]}_vCSm") for i in insts]          # instância sm_<prefixo>: o canal do circuito é <prefixo>_vCSm
iguais = d and all(a in d and c in d and np.array_equal(d[a][:-1], d[c][:-1]) and np.isnan(d[a][-1]) for a, c in pares)   # a última: só a medida final
ok(bool(iguais), f"na cascata: o m[\"vCSm\"] de cada instância é o vCSm do subcircuito dela, amostra a amostra ({len(d.get('t', []))} amostras; "
                 f"{', '.join(f'{a} = {c}' for a, c in pares[:3])}…) {j.get('erro', '')}")
ok(d and all(float(d[f"{i}_eu"][0]) == float(i.split("_")[-1]) for i in insts), "e p[\"subcircuito\"] de cada instância é o dela")
api("editor/abrir", {"arq": PI, "modo": "descartar"})
print("falhas:", falhas)
