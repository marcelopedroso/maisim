"""O padrão dentro da amostra (instância de teste 8768), Marcelo em 20/10 ("é pra simular o controle do artigo"): o timer
de PWM de cada SM do artigo compara a portadora com m a cada Δt (1 µs) numa janela de controle de Ts = 20 µs; no PEW, a
atuação pode vir como uma lista de Ts/Δt valores, um por Δt. Circuito: fonte controlada pelo CONST "s" num R (a corrente
é o valor da fonte, sem dinâmica), Δt = 1 µs, Ts = 8 µs.
- lista com valores iguais = o mesmo número: a série é a mesma, nos modos de atraso "logo" e "amostra";
- lista [f(k) + o]: o valor o é sentido o Δt depois do valor o − 1 (em "amostra": a janela inteira da amostra seguinte);
- lista do tamanho errado: erro que diz Ts/Δt."""
import json, time, urllib.request
import numpy as np
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
api("editor/novo", {"modo": "descartar"})
for a in (["U.1", 6, 12, "U"], ["L.1", 26, 6, "L"], ["R.1", 32, 12, "R"], ["CONST.1", 8, 20, "CONST"], ["AMP.1", 40, 16, "AMP"]):
    c("CREATE", a)
for nome, i, o in (("U.1", "vin", "gnd"), ("L.1", "vin", "o"), ("R.1", "o", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["L.1", "L", 1e-3]); c("SETP", ["R.1", "R", 1.0]); c("SETP", ["CONST.1", "const", 0.0])
c("OUTNODE", ["CONST.1", 0, "s"]); c("OUTNODE", ["AMP.1", 0, "i_L"])
api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"})
r = api("editor/fonte_sinal", {"nome": "U.1", "sinal": "s"})
ok("ERRO" not in r, f"circuito: fonte controlada por s num RL (1 mH, 1 Ω: a corrente guarda a história de cada Δt) ({r.get('ERRO', 'ok')})")
NTS = 8
# V(S): o valor que o circuito deve sentir no passo S (irregular, para errar de Δt aparecer)
V = "def V(S):\n    return 10.0 * ((7 * S) % 11) - 30.0\n"
COD = {"fino": V + "def passo(t, m, p, e):\n    s = round(t / 1e-6)\n    return {'s': V(s + 1)}\n",           # Ts = Δt, logo: sente em s + 1
       "fino8": V + "def passo(t, m, p, e):\n    s = round(t / 1e-6)\n    return {'s': V(s + 1) if s + 1 >= 8 else 0.0}\n",   # nada antes da 2ª janela
       "padrao_logo": V + "def passo(t, m, p, e):\n    k = round(t / p['Ts'])\n    return {'s': [V(8 * k + 1 + o) for o in range(8)]}\n",
       "padrao_amostra": V + "def passo(t, m, p, e):\n    k = round(t / p['Ts'])\n    return {'s': [V(8 * k + 8 + o) for o in range(8)]}\n",
       "iguais": "def passo(t, m, p, e):\n    k = round(t / p['Ts'])\n    return {'s': [10.0 * (k + 1)] * 8}\n",
       "numero": "def passo(t, m, p, e):\n    k = round(t / p['Ts'])\n    return {'s': 10.0 * (k + 1)}\n",
       "errado": "def passo(t, m, p, e):\n    return {'s': [1.0] * 7}\n"}
def roda(cod, modo, nts=NTS):
    cfg = {"ativo": True, "Ts": nts * 1e-6, "atuacoes": ["s"], "parametros": [], "codigo": COD[cod], "atraso": {"modo": modo, "tempo": 0},
           "acionamentos": []}
    r = api("editor/controle", {"controle": cfg})
    assert "ERRO" not in r, r
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "6.4e-05", "nome": f"padrao_{cod}_{modo}", "amostras": "100000"})
    if "ERRO" in j:
        return None, j["ERRO"]
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.2); j = api("editor/rodada")
    if j.get("estado") != "fim":
        return None, j.get("erro") or j.get("estado")
    return np.load(j["arquivo"])["i_L"], None
for modo in ("logo", "amostra"):
    a, _ = roda("numero", modo)
    b, _ = roda("iguais", modo)
    ok(a is not None and b is not None and np.array_equal(a, b), f"{modo}: lista de 8 valores iguais = o número (i_L igual nas {len(a) if a is not None else 0} amostras)")
finos = {"logo": roda("fino", "logo", 1)[0], "amostra": roda("fino8", "logo", 1)[0]}   # em "amostra", a 1ª janela é a do CONST
for modo in ("logo", "amostra"):
    fino = finos[modo]
    b, err = roda(f"padrao_{modo}", modo)
    n = min(len(b), len(fino[::NTS])) if b is not None else 0
    dif = float(np.abs(b[:n] - fino[::NTS][:n]).max()) if n else float("nan")
    ok(n >= 8 and dif < 1e-9, f"{modo}: o padrão de 8 valores por amostra = um valor por Δt com Ts = Δt (V(S) irregular; diferença máx de i_L "
       f"{dif:.2e} A em {n} amostras; i_L = {np.round(b[:5], 5) if b is not None else err})")
_, err = roda("errado", "amostra")
ok(err and "7 valores" in str(err) and "Ts/Δt = 8" in str(err), f"tamanho errado: {str(err)[:160]}")
api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
