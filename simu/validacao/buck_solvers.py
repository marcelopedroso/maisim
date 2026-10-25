"""O mesmo buck nos três métodos de integração do Gecko (o campo "Integração" do ⚙ = o solverType do .ipes), na instância
de teste (7201). O buck do buck_monta.py (Vdc 100 V → S.1 → L.1 1 mH → R.1 2 Ω, D.1 de roda livre), a chave fechada em t = 0
e aberta em 0,2 ms (acionamento do CONST g): a corrente sobe, cai pelo diodo, chega a zero (~2,2 ms) e o diodo bloqueia.
  - chave fechada (topologia fixa, um RL): cada método bate com a sua própria recorrência (a referência no mesmo método,
    como o buck_ref.py faz para o Euler implícito), a partir do estado do 1º passo do Gecko;
  - o erro de cada um contra a solução exata do RL (do mesmo ponto de partida): Euler de 1ª ordem, trapézio e Gear de 2ª;
  - depois do bloqueio do diodo, o trapézio oscila de um passo para o outro (a corrente de L cortada por um resistor de
    10 MΩ: o fator de amplificação do trapézio fica em ≈ −1), e o Euler e o Gear amortecem.
A figura vai para dados/solver_buck_trapezio.png. Uso: python3 buck_solvers.py (termina com o Gecko no Euler implícito)."""
import gzip, json, subprocess, sys, time, urllib.request
from pathlib import Path
import numpy as np

AQUI = Path(__file__).resolve().parent
B = "http://localhost:7201/maisim/simu/"
V, L, RT, DT, T_ABRE, TFIM = 100.0, 1e-3, 2.0 + 0.01, 1e-6, 2e-4, 3e-3   # RT: a carga e o rON da chave
NOMES = {0: "backward-euler", 1: "trapezoidal", 2: "gear-shichman"}


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def monta():
    """O buck do buck_monta.py, com a chave fechada em t = 0 e aberta em T_ABRE (sem controle: só o acionamento)."""
    subprocess.run([sys.executable, str(AQUI / "buck_monta.py")], check=True, capture_output=True, cwd=AQUI)
    r = api("editor/cmd", {"op": "SETP", "args": ["CONST.1", "const", 1.0]}); assert "ERRO" not in r, r
    cfg = {"ativo": False, "Ts": DT, "atuacoes": [], "parametros": [], "codigo": "", "atraso": {"modo": "logo", "tempo": 0},
           "acionamentos": [{"t": T_ABRE, "alvo": "CONST:g", "valor": 0.0}]}
    r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r and not r.get("erros"), r


def roda(solver, nome, tfim=TFIM):
    j = api("editor/rodar", {"dt": repr(DT), "tfim": repr(tfim), "nome": nome, "amostras": "100000", "solver": str(solver)})
    assert "ERRO" not in j, j
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.2); j = api("editor/rodada")
    assert j.get("estado") == "fim", j
    return j, np.load(j["arquivo"])


def referencia(solver, i):
    """A recorrência do método no RL da chave fechada (V = L di/dt + RT i), a partir do 1º passo do Gecko (i[1]; o Gear
    também do 2º, i[2]: ele usa dois passos de histórico). i[k] é a corrente depois de k passos (a amostra 0 é a do passo de
    prova, igual à 1). As fórmulas são as do InductorCalculator do Gecko (BE, TRZ, GS)."""
    k_on = round(T_ABRE / DT)
    r = np.array(i[:k_on + 1], dtype=float)
    a = DT * RT / (2 * L)
    for n in range(2 if solver == 2 else 1, k_on):
        if solver == 0:
            r[n + 1] = (r[n] + DT * V / L) / (1 + DT * RT / L)
        elif solver == 1:
            r[n + 1] = (r[n] * (1 - a) + DT * V / L) / (1 + a)
        else:
            r[n + 1] = (4 * r[n] - r[n - 1] + 2 * DT * V / L) / (3 + 2 * DT * RT / L)
    return r


api("editor/novo", {"descartar": True})
monta()
res = {}
for s in (1, 2, 0):                                 # o Euler por último: o Gecko de teste volta ao padrão
    j, d = roda(s, f"solver_{s}")
    meta = json.loads(str(d["meta"]))
    b = (Path(j["arquivo"]).parent / f"solver_{s}.ipes").read_bytes()   # o circuito exato da rodada (gzip ou não)
    ipes = (gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b).decode("utf-8", "replace")
    res[s] = dict(t=d["t"], i=d["i_L"], v=d["v_sw"], meta=meta, ipes=ipes, resumo=(Path(j["arquivo"]).parent / "resumo.md"))
    ok(meta.get("solver") == NOMES[s] and f"\nsolverType {s}\n" in ipes,
       f"solverType {s}: o meta diz {meta.get('solver')} e o .ipes da rodada tem solverType {s}")

k_on, N0 = round(T_ABRE / DT), 20
linhas = []
for s in (0, 1, 2):
    t, i, v = res[s]["t"], res[s]["i"], res[s]["v"]
    r = referencia(s, i)
    e_ref = float(np.abs(i[1:k_on + 1] - r[1:k_on + 1]).max())
    # o RL exato a partir do mesmo i no passo N0 (depois da partida: o 1º passo do trapézio e do Gear sai do estado inicial
    # do Gecko, e o Gear ainda leva uns passos para esquecer o histórico de antes)
    ex = V / RT + (i[N0] - V / RT) * np.exp(-(t[N0:k_on + 1] - t[N0]) * RT / L)
    e_ex = float(np.abs(i[N0:k_on + 1] - ex).max())
    blq = t[(t > T_ABRE) & (i < 1e-4)]
    t_blq = float(blq[0]) if len(blq) else float("nan")
    J = t > t_blq + 0.1e-3                               # o diodo já bloqueado: só o resto
    osc = float(np.abs(v[J]).max()) if J.any() else float("nan")
    alterna = bool(J.any() and np.mean(np.sign(v[J][1:]) == -np.sign(v[J][:-1])) > 0.9)
    res[s].update(e_ref=e_ref, e_ex=e_ex, t_blq=t_blq, osc=osc, alterna=alterna)
    ok(e_ref < 1e-6, f"{NOMES[s]}: chave fechada, Gecko × a recorrência do mesmo método: max |Δi_L| = {e_ref:.2e} A (em {k_on} passos)")
    linhas.append(f"| {NOMES[s]} | {i[1]:.5f} | {e_ref:.1e} | {e_ex:.1e} | {t_blq * 1e3:.3f} | {osc:.3g} |")
ok(res[0]["e_ex"] > 5 * max(res[1]["e_ex"], res[2]["e_ex"]),
   f"contra o RL exato: Euler {res[0]['e_ex']:.1e} A (1ª ordem), trapézio {res[1]['e_ex']:.1e} A e Gear {res[2]['e_ex']:.1e} A (2ª ordem)")
ok(res[1]["osc"] > 0.05 and res[1]["alterna"],
   f"trapézio: depois do bloqueio do diodo, v_sw oscila de um passo para o outro (±{res[1]['osc']:.3f} V, sem amortecer)")
ok(res[0]["osc"] < 1e-3 and res[2]["osc"] < 1e-3,
   f"Euler e Gear amortecem: |v_sw| ≤ {res[0]['osc']:.1e} V e {res[2]['osc']:.1e} V depois do bloqueio")
ok(all(abs(res[s]["t_blq"] - res[0]["t_blq"]) < 5e-6 for s in (1, 2)),
   "o diodo bloqueia no mesmo instante nos três (±5 µs): " + ", ".join(f"{res[s]['t_blq'] * 1e3:.3f} ms" for s in (0, 1, 2)))
txt = res[1]["resumo"].read_text() if res[1]["resumo"].exists() else ""
ok("trapezoidal" in txt, "o resumo.md da rodada diz a integração (trapezoidal)")

print("\n| solverType | i_L(Δt) [A] | max |Gecko − mesmo método| [A] | max |Gecko − RL exato| (desde o passo 20) [A] | bloqueio do diodo [ms] | max |v_sw| depois [V] |")
print("|---|---|---|---|---|---|")
print("\n".join(linhas))

try:                                                 # a figura (sem o matplotlib, só os números)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 6.5), constrained_layout=True)
    cores = {0: "#2563eb", 1: "#dc2626", 2: "#16a34a"}
    rot = {0: "Euler implícito / backward Euler", 1: "trapézio / trapezoidal", 2: "Gear (BDF2)"}
    for s in (0, 2, 1):
        a1.plot(res[s]["t"] * 1e3, res[s]["i"], color=cores[s], lw=1.4, label=rot[s])
    a1.set_xlabel("t [ms]"); a1.set_ylabel("i_L [A]"); a1.legend(); a1.grid(alpha=.3)
    a1.set_title("buck: Vdc 100 V, L 1 mH, R 2 Ω, Δt 1 µs; chave aberta em 0,2 ms / switch opened at 0.2 ms")
    t0 = res[0]["t_blq"]
    for s in (0, 2, 1):
        J = (res[s]["t"] > t0 - 30e-6) & (res[s]["t"] < t0 + 120e-6)
        a2.plot((res[s]["t"][J] - t0) * 1e6, res[s]["v"][J], color=cores[s], lw=1.1, marker=".", ms=3, label=rot[s])
    a2.set_xlabel("t − t_bloqueio do diodo / diode blocking [µs]"); a2.set_ylabel("v_sw [V]"); a2.grid(alpha=.3); a2.legend()
    a2.set_title(f"o trapézio oscila ±{res[1]['osc']:.2f} V depois do bloqueio / trapezoidal rings after the diode blocks")
    a2.set_ylim(-1.2, 1.2)
    fig.savefig(AQUI / "dados" / "solver_buck_trapezio.png", dpi=110)
    print("figura:", AQUI / "dados" / "solver_buck_trapezio.png")
except ImportError:
    print("(sem o matplotlib: a figura fica de fora)")
print(f"\n{'OK' if not falhas else 'FALHA'}: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
