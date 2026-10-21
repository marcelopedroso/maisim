"""Os cartões dos controladores seguem o código (instância de teste 7201), escolha de Marcelo em 19/10 — os SMs mudaram de
nome, o código foi acertado e os cartões ficaram com vc_smap_1 e sm_ap_1_s ("as variáveis nem existem mais"; "tem que ser
algo tipo variável do código não existe no esquema"; "ter uma lista para tentar colocar outra"):
o cartão lê o que o código lê (o nome entre aspas, também por NOME = "x" num módulo) e escreve o que o passo() devolve
(também return f({"x": …})), mais o que foi posto à mão e existe; o que não existe no esquema sai sozinho, sem aviso; as
atuações escritas ficam marcadas; o aviso que fica é o da variável do código que não existe no esquema (arquivo:linha);
trocar por um nome que existe (editor/controle/renomeia) tira o aviso."""
import json, urllib.request
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=180).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
ORQ = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n'
DSP_A = '''import leitura_a


def iniciar(p, e):
    pass


def passo(t, m, p, e):
    v = leitura_a.passo(m)
    return dict_saida({"u_a": v})


def dict_saida(d):
    return d
'''
LEITURA_A = '''NOME = "v1"
OUTRO = "zz"


def passo(m):
    return m[NOME] + m[OUTRO]
'''
DSP_B = '''def iniciar(p, e):
    pass


def passo(t, m, p, e):
    x = m["v2"] + m["nao_existe"]
    return {"u_b": x, "u_fantasma": 0.0}
'''
api("editor/novo", {"modo": "descartar"})
for k, (n, rot) in enumerate([("A", "u_a"), ("Bc", "u_b"), ("M1", "v1"), ("M2", "v2")]):
    c("CREATE", n, 10 + 8 * k, 5, "CONST"); c("OUTNODE", n, 0, rot)
q = lambda nome, arq, med, atu, todas=False: {"nome": nome, "arquivo": arq, "todas": todas, "medidas": med, "atuacoes": atu, "subcircuitos": []}
r = api("editor/controle", {"controle": {"ativo": True, "Ts": 1e-4, "atuacoes": ["sumiu"], "parametros": [], "acionamentos": [], "codigo": ORQ,
        "arquivos": {"dsp_a.py": DSP_A, "leitura_a.py": LEITURA_A, "dsp_b.py": DSP_B},
        "controladores": [q("controle", "controle.py", [], [], True), q("dsp_a", "dsp_a.py", ["velho", "v2"], ["sumiu"]), q("dsp_b", "dsp_b.py", [], [])]}})
cs = {x["nome"]: x for x in r.get("controle", {}).get("controladores", [])}
ok(not r.get("ERRO") and cs["dsp_a"]["medidas"] == ["v2", "v1"] and cs["dsp_a"]["atuacoes"] == ["u_a"],
   f"dsp_a: lê {cs.get('dsp_a', {}).get('medidas')} (v1 pelo NOME do módulo; v2 posto à mão e existe; velho saiu), escreve {cs.get('dsp_a', {}).get('atuacoes')} (pelo return f({{…}}); sumiu saiu) {r.get('erro', '')}")
ok(cs["dsp_b"]["medidas"] == ["v2"] and cs["dsp_b"]["atuacoes"] == ["u_b"], f"dsp_b: lê {cs['dsp_b']['medidas']}, escreve {cs['dsp_b']['atuacoes']} (pelo código)")
ok(sorted(r["controle"]["atuacoes"]) == ["u_a", "u_b"] and not r.get("erros_controladores"),
   f"atuações marcadas {r['controle']['atuacoes']} (sumiu saiu, u_a e u_b entraram); sem os avisos de cartão {r.get('erros_controladores')}")
sem = {(x["nome"], x["tipo"]): x["usos"] for x in r.get("sem_esquema") or []}
ok(sem == {("zz", "medida"): [{"arquivo": "leitura_a.py", "linha": 2}], ("nao_existe", "medida"): [{"arquivo": "dsp_b.py", "linha": 6}],
           ("u_fantasma", "atuação"): [{"arquivo": "dsp_b.py", "linha": 7}]}, f"variáveis do código que não existem no esquema: {sem}")
g = api("editor/controle")
ok({x["nome"]: x["medidas"] for x in g["controle"]["controladores"]}.get("dsp_a") == ["v2", "v1"], "guardado já com os cartões do código (o arquivo do controle)")
# trocar por um nome que existe
r = api("editor/controle/renomeia", {"pares": [["nao_existe", "v1"]]})
cs = {x["nome"]: x for x in r["controle"]["controladores"]}
sem = {x["nome"] for x in r.get("sem_esquema") or []}
ok(r.get("trocas") == 1 and 'm["v1"]' in r["controle"]["arquivos"]["dsp_b.py"] and "nao_existe" not in sem and sorted(cs["dsp_b"]["medidas"]) == ["v1", "v2"],
   f"trocar nao_existe por v1: {r.get('trocas')} troca; o aviso sai; dsp_b lê {cs['dsp_b']['medidas']}")
r = api("editor/controle/renomeia", {"pares": [["zz", "v2"]]})
ok('OUTRO = "v2"' in r["controle"]["arquivos"]["leitura_a.py"] and "zz" not in {x["nome"] for x in r.get("sem_esquema") or []}, 'trocar zz por v2: no módulo, OUTRO = "v2"')
# o circuito muda: o cartão acompanha (a medida apagada sai do cartão; o código que a lê vira aviso)
c("DELETE", "M2")
g = api("editor/controle")
cs = {x["nome"]: x for x in g["controle"]["controladores"]}
sem = {x["nome"] for x in g.get("sem_esquema") or []}
ok("v2" not in cs["dsp_a"]["medidas"] and "v2" not in cs["dsp_b"]["medidas"] and "v2" in sem and not g.get("erros_controladores"),
   f"M2 (v2) apagado: sai dos cartões ({cs['dsp_a']['medidas']}, {cs['dsp_b']['medidas']}); o código que lê v2 vira aviso")
# uma função dentro do passo() que devolve o dicionário de uma mensagem não é atuação (Marcelo, 20/10: o _msg() do central
# saía como "a variável th do código não existe no esquema (como atuação)")
ORQ2 = ('def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    def _msg(x):\n        return {"th": x, "vf0": 2 * x}\n'
        '    envia("dsp_b", _msg(1.0))\n    return {"fantasma2": 0.0}\n')
r = api("editor/controle", {"controle": dict(api("editor/controle")["controle"], codigo=ORQ2)})
sem = {x["nome"] for x in r.get("sem_esquema") or []}
ok(not {"th", "vf0"} & sem and "fantasma2" in sem, f"a função dentro do passo(): th e vf0 não são acusados; o return do passo() sim ({sorted(sem)})")
# mais de 30 arquivos (Marcelo, 19/10: o MMC trifásico com 19 DSPs passou do limite de antes, "proposta inválida: até 30 arquivos")
muitos = {f"cel_{k}.py": 'def passo(t, m, p, e):\n    return {}\n' for k in range(40)}
r = api("editor/controle", {"controle": {"ativo": False, "Ts": 1e-4, "atuacoes": [], "parametros": [], "acionamentos": [], "codigo": ORQ, "arquivos": muitos,
        "controladores": [q("controle", "controle.py", [], [], True)] + [q(f"cel_{k}", f"cel_{k}.py", [], []) for k in range(40)]}})
ok(not r.get("ERRO") and len(r["controle"]["arquivos"]) == 40 and len(r["controle"]["controladores"]) == 41, f"40 arquivos e 41 controladores: aceitos {r.get('erro', '')}")
api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
