"""A amostra de t = 0 (21/10): antes do 1º passo as saídas do Gecko valiam 0, e o controle recebia zeros em passo(t = 0) —
no porte do controle do artigo, os SMs nasceriam com v_C = 0. Agora o MaiSim dá um passo de prova, lê o estado inicial e
recomeça a simulação (INIT de novo). Na instância de teste (7201), com o buck do exemplo e a chave fechada em t = 0:
  - o controle recebe em t = 0 o estado do 1º passo do Gecko (v_sw ≈ 100 V, não 0), e o scope mostra o mesmo;
  - esse estado é exatamente o de t = Δt de uma rodada com Ts = Δt (o 1º passo), e o resto da rodada é o de sempre;
  - sem controle (só o scope), a 1ª amostra também é o estado inicial."""
import json, time, urllib.request
from pathlib import Path
import numpy as np
B = "http://localhost:7201/maisim/simu/"
T = Path.home() / ".cache/maisim_teste"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (T / "circuitos" / f).write_bytes((dados / f).read_bytes())
COD = ("def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    scope('vsw_visto', m['v_sw']); scope('iL_visto', m['i_L'])\n"
       "    return {'g': 1.0 if (t % 1e-4) < 5e-5 else 0.0}\n")


FIXO = "def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {'g': 1.0}\n"   # sem bordas (o t % de um PWM arredonda diferente com outro Ts)


def roda(nome, ts, ativo=True, cod=COD):
    r = api("editor/abrir", {"arq": str(T / "circuitos" / "exemplo_controle_pwm.ipes"), "modo": "descartar"}); assert "ERRO" not in r, r
    r = api("editor/cmd", {"op": "SETP", "args": ["CONST.1", "const", 1.0]}); assert "ERRO" not in r, r   # a chave fechada em t = 0
    cfg = {"ativo": ativo, "Ts": ts, "atuacoes": ["g"], "parametros": [], "codigo": cod, "atraso": {"modo": "logo", "tempo": 0}, "acionamentos": []}
    r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r, r
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.0002", "nome": nome, "amostras": "100000"}); assert "ERRO" not in j, j
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.2); j = api("editor/rodada")
    assert j.get("estado") == "fim", j
    return np.load(j["arquivo"])


a = roda("t0_ts2", 2e-6)
ok(a["v_sw"][0] > 99.9 and a["vsw_visto"][0] == a["v_sw"][0] and a["iL_visto"][0] == a["i_L"][0] and a["i_L"][0] > 0,
   f"com controle: o passo(t = 0) recebe o estado inicial (v_sw {a['v_sw'][0]:.3f} V, i_L {a['i_L'][0]:.4f} A), não zeros; o scope mostra o mesmo")
b = roda("t0_ts1", 1e-6)
ok(all(a[k][0] == b[k][1] for k in ("v_sw", "v_o", "i_L")) and b["t"][1] == 1e-6,
   "o estado de t = 0 é exatamente o do 1º passo do Gecko (t = Δt, numa rodada com Ts = Δt)")
a2, b2 = roda("t0_fixo2", 2e-6, cod=FIXO), roda("t0_fixo1", 1e-6, cod=FIXO)
n = min(len(a2["t"]), (len(b2["t"]) + 1) // 2)
ok(all(np.array_equal(a2[k][1:n], b2[k][2:2 * n:2]) for k in ("v_sw", "v_o", "i_L")) and a2["v_sw"][0] == b2["v_sw"][0],
   f"o resto da rodada não muda com o passo de prova (chave sempre fechada: Ts = 2Δt e Ts = Δt batem nos {n - 1} instantes comuns)")
c = roda("t0_sem", 2e-6, ativo=False)
ok(c["v_sw"][0] > 99.9, f"sem controle (só o scope): a 1ª amostra é o estado inicial (v_sw {c['v_sw'][0]:.3f} V)")
api("editor/abrir", {"arq": str(T / "circuitos" / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
