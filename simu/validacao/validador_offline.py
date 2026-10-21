import sys, importlib.util
P = str(__import__("pathlib").Path(__file__).resolve().parents[1])   # simu/
sys.path.insert(0, P)
spec = importlib.util.spec_from_file_location("srv", P + "/servidor.py"); srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
CLOCK = '''"CONST_1"# comentário
def iniciar(p, e):
    pass


def passo(t, m, p, e):
    fase = (t * p["f_clk"] + 1e-9) % 1.0
    return {"CONST_1": 1.0 if fase < p["duty"] else 0.0}
'''
c = srv.confere_codigo(CLOCK, [{"nome": "k1"}], ["CONST_1"], None, None)
ok([(x["linha"], x["msg"][:20]) for x in c] == [(7, 'p["f_clk"] não exist'), (8, 'p["duty"] não existe')], f"o código do Marcelo: {[(x['linha'], x['coluna'], x['fim'], x['msg']) for x in c]}")
c = srv.confere_codigo(CLOCK, [{"nome": "f_clk"}, {"nome": "duty"}], ["CONST_1"], ["Vsin", "i_R_1", "CONST_1"], [{"nome": "CONST_1"}])
ok(c == [], "com f_clk e duty no painel: nada")
c = srv.confere_codigo(CLOCK, [{"nome": "f_clk"}, {"nome": "duty"}], [], ["Vsin"], [{"nome": "CONST_1"}])
ok(len(c) == 1 and "não está marcado" in c[0]["msg"] and c[0]["linha"] == 8, f"atuação não marcada: {c[0]['msg'] if c else c}")
c = srv.confere_codigo(CLOCK.replace('"CONST_1": 1.0', '"CONST_2": 1.0'), [{"nome": "f_clk"}, {"nome": "duty"}], ["CONST_1"], ["Vsin"], [{"nome": "CONST_1"}])
ok(len(c) == 1 and "não é atuador do circuito" in c[0]["msg"], f"atuador inexistente: {c[0]['msg'] if c else c}")
OUTRO = '''def iniciar(par, est):
    par["ganho"] = 2.0 * par["Kp"]

def passo(tt, med, par, est):
    x = med["i_L"] + med["nao_tem"] + par["ganho"] + par["Ts"]
    return {}
'''
c = srv.confere_codigo(OUTRO, [{"nome": "Kp"}], [], ["i_L", "v_o"], [])
ok([x["msg"][:25] for x in c] == ['m["nao_tem"] não é medida'], f"nomes próprios dos argumentos, p criado em iniciar, Ts: {[x['msg'] for x in c]}")
c = srv.confere_codigo("def passo(t, m):\n    return {}\n", [], [], None, None)
ok(len(c) == 1 and "4 argumentos" in c[0]["msg"], f"assinatura: {c[0]['msg'] if c else c}")
ok(srv.confere_codigo("def passo(t, m, p, e)\n  x", [], [], None, None) == [], "erro de sintaxe: a conferência não roda (o erro de sintaxe já aparece)")
c = srv.confere_codigo(CLOCK, [], ["CONST_1"], None, None)
ok(all(x["fim"] > x["coluna"] for x in c), f"colunas do sublinhado: {[(x['coluna'], x['fim']) for x in c]}")
# revisão: padrões válidos que não podem acusar
OK3 = '''def iniciar(p, e):
    p.setdefault("a", 1.0)
    p.update(b=2.0)
    p.update({"c": 3.0})

def passo(t, m, p, e, extra=None):
    def ajuda(p):
        return p["qualquer"]
    if "d" in p:
        x = p["d"]
    return {"u": p["a"] + p["b"] + p["c"] + ajuda({"qualquer": 1})}
'''
c = srv.confere_codigo(OK3, [], ["u"], None, None)
ok(c == [], f"setdefault, update, 'x' in p, função de dentro e passo com argumento padrão: nada ({[x['msg'] for x in c]})")
ACENTO = '''def passo(t, m, p, e):
    é = 1; ç = p["falta"]
    return {}
'''
c = srv.confere_codigo(ACENTO, [], [], None, None)
ok(len(c) == 1 and (c[0]["coluna"], c[0]["fim"]) == (16, 26), f"coluna em linha com acento (caracteres, não bytes): {[(x['coluna'], x['fim']) for x in c]}")
c = srv.confere_codigo("def passo(t, m, p):\n    return {}\n", [], [], None, None)
ok(len(c) == 1 and "4 argumentos" in c[0]["msg"], "passo com 3 argumentos: acusa")
print("falhas:", falhas)
