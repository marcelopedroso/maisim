"""Validação do passo 1 do Controle: PI de corrente num RL com fonte controlada por sinal, rodado pelo MaiSim (Gecko +
código do usuário no laço) × referência independente (RL exato a cada Δt, mesmo PI, mesmo tempo de aplicação)."""
import json, math, time, urllib.request
import numpy as np
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
ok = lambda c, t: print(("OK   " if c else "FALHA"), t)
c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
R, L, dt, Ts, tfim, iref, Vmax = 1.0, 10e-3, 1e-6, 100e-6, 0.01, 5.0, 100.0
wc = 2 * math.pi * 200; Kp, Ki = L * wc, R * wc
# o circuito do teste, numa folha em branco (antes ele dependia do que o controle_tela.js deixava aberto)
api("editor/novo", {"modo": "descartar"})
for a in (["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]):
    c("CREATE", a)
# ligações por rótulo: a (+ da fonte) → R → b → L → gnd
for nome, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "b"), ("L.1", "b", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["R.1", "R", R]); c("SETP", ["L.1", "L", L]); c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "u_ctrl"])
r = api("editor/fonte_sinal", {"nome": "U.1", "sinal": "u_ctrl"}); ok("ERRO" not in r, f"fonte U.1 controlada pelo sinal u_ctrl {r.get('ERRO', '')}")
u1 = next(e for e in r["folhas"]["0"]["elementos"] if e["nome"] == "U.1"); print("   U.1 depois:", u1["par"].get("type"), u1["mede"])
c("OUTNODE", ["AMP.1", 0, "i_L"]); r = api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"}); ok("ERRO" not in r, "amperímetro em L.1 (i_L)")
codigo = '''def iniciar(p, e):
    e["integral"] = 0.0
    print("PI: Kp =", p["Kp"], "Ki =", p["Ki"], "Ts =", p["Ts"])


def passo(t, m, p, e):
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    u = max(-p["Vmax"], min(p["Vmax"], u))
    scope("erro", erro)
    return {"u_ctrl": u}
'''
cfg = {"ativo": True, "Ts": Ts, "atuacoes": ["u_ctrl"], "codigo": codigo,
       "parametros": [{"nome": "Kp", "valor": Kp, "unidade": "V/A"}, {"nome": "Ki", "valor": Ki, "unidade": "V/(A·s)"},
                      {"nome": "i_ref", "valor": iref, "unidade": "A"}, {"nome": "Vmax", "valor": Vmax, "unidade": "V"}]}
r = api("editor/controle", {"controle": cfg})
ok("ERRO" not in r and not r["erros"] and not r["avisos"], f"controle guardado: entradas {r.get('entradas')} · atuadores {[a['nome'] for a in r.get('atuadores', [])]} · erros {r.get('erros')} avisos {r.get('avisos')}")
j = api("editor/rodar", {"dt": repr(dt), "tfim": repr(tfim), "nome": "teste_controle_pi", "amostras": "100000"})
while j.get("estado") in ("rodando", "pausada"): time.sleep(0.5); j = api("editor/rodada")
ok(j.get("estado") == "fim", f"rodada com o controle: {j.get('estado')} {j.get('erro', '')} · {j.get('amostras')} amostras em {j.get('segundos')} s")
print("   saída do controle:", (j.get("saida_controle") or "").strip()[:200])
d = np.load(j["arquivo"]); t, iL, uc, er = d["t"], d["i_L"], d["u_ctrl"], d["erro"]
print(f"   Gecko: {len(t)} amostras, t de {t[0]} a {t[-1]:.6f}; i_L final {iL[-2]:.6f} A")
# referência independente: RL exato por passo de Δt; atuação u_k vale a partir do passo k·n+1 (atraso de 1 Δt)
n = int(round(Ts / dt)); N = int(round(tfim / dt)); a = math.exp(-R * dt / L)
def referencia(atraso_med):
    i = np.zeros(N + 1); u_ant = 0.0; integ = 0.0; us, es, iks = [], [], []
    u_k = 0.0
    for j_ in range(N):
        if j_ % n == 0:                                   # amostra k = j_/n: mede, calcula
            im = i[j_ - atraso_med] if j_ - atraso_med >= 0 else 0.0
            erro = iref - im; integ += erro * (n * dt)
            u_ant, u_k = u_k, max(-Vmax, min(Vmax, Kp * erro + Ki * integ))
            us.append(u_k); es.append(erro); iks.append(im)
            u_aplic = u_ant                               # o 1º passo do período ainda usa a atuação anterior
        else:
            u_aplic = u_k
        i[j_ + 1] = i[j_] * a + (u_aplic / R) * (1 - a)
    return i, np.array(us), np.array(es)
K = len(er) - 1                                           # a última amostra (fim) não tem passo()
for atraso in (0, 1):
    i_ref_, us, es = referencia(atraso)
    e_i = np.max(np.abs(iL[:K] - i_ref_[::n][:K])); e_e = np.max(np.abs(er[:K] - es[:K]))
    print(f"   hipótese de medida com atraso de {atraso} Δt: max|i_L − ref| = {e_i:.3e} A, max|erro − ref| = {e_e:.3e} A")
i_ref_, us, es = referencia(0)
e_i = np.max(np.abs(iL[:K] - i_ref_[::n][:K])); e_u = np.max(np.abs(uc[1:K] - us[:K - 1]))
ok(e_i < 1e-3 and e_u < 1e-2, f"Gecko × referência: corrente {e_i:.2e} A (de 5 A), atuação lida de volta (CONST) {e_u:.2e} V")
ok(abs(iL[-2] - iref) < 1e-3, f"regime: i_L = {iL[-2]:.5f} A (referência 5 A)")
# subida: com cancelamento de polo, resposta ≈ 1ª ordem com τ = 1/ωc
i63 = t[np.argmax(iL >= iref * (1 - math.exp(-1)))]
print(f"   tempo para 63 % de 5 A: {i63 * 1e3:.3f} ms (1/ωc = {1e3 / wc:.3f} ms, mais o atraso de amostragem)")
