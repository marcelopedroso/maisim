"""O exemplo do SVM (instância de teste 7201; exemplos/exemplo_inversor_svm): um inversor trifásico em malha aberta, com a
modulação por vetores espaciais no código (um acionamento digital: o controle.py não lê medida nenhuma) e os três PWMs do
módulo pwm da biblioteca, com os registradores nos parâmetros. Confere, numa rodada de 4 ciclos de 60 Hz (Δt = 1 µs,
todas as amostras):
- o exemplo abre com o controle ligado, os registradores e as sete atuações (seis pulsos e o vetor para o Scope);
- T1 + T2 + T0 = Ts em toda amostra, e nenhum tempo negativo;
- o setor anda de 1 a 6, 60° cada um (a mesma duração, um sexto do ciclo);
- em cada setor só aparecem os dois vetores ativos vizinhos e os nulos (V0 e V7), fora o primeiro período do setor (o
  CMPA escrito numa amostra só vale na seguinte: o registrador sombra);
- uma chave troca por vez (do vetor de um passo ao do seguinte muda só uma fase; nas fronteiras dos setores, onde um
  dos tempos é quase zero, duas podem trocar no mesmo passo de 1 µs);
- a fundamental da tensão de linha: pico m·Vdc, com m = 0,8 e depois m = 1 (o acionamento do exemplo), dentro de 2 %;
- as duas chaves de um braço nunca ligadas juntas."""
import json, time, urllib.request
import numpy as np
B = "http://localhost:7201/maisim/simu/"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": json.loads(e.read() or b"{}")}


falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


ESTADOS = {0: (0, 0, 0), 1: (1, 0, 0), 2: (1, 1, 0), 3: (0, 1, 0), 4: (0, 1, 1), 5: (0, 0, 1), 6: (1, 0, 1), 7: (1, 1, 1)}   # o vetor → as chaves de cima (abc)
try:
    r = api("editor/abrir", {"arq": "exemplos/exemplo_inversor_svm.ipes", "modo": "descartar"})
    c = api("editor/controle").get("controle", {})
    pars = {q["nome"]: q["valor"] for q in c.get("parametros", [])}
    ok("ERRO" not in r and c.get("ativo") and {"f_clk", "TBPRD", "CTRMODE", "INTSEL", "f1", "m", "Vdc"} <= set(pars)
       and c.get("atuacoes") == ["g_a", "n_a", "g_b", "n_b", "g_c", "n_c", "vetor"] and "pwm.py" in c.get("arquivos", {}) and 'm["' not in c.get("codigo", ""),
       f"o exemplo abre com o controle ligado, os registradores, os seis pulsos e o vetor, sem ler medida ({r.get('ERRO', 'ok')})")
    Ts, f1, Vdc = 2 * pars["TBPRD"] / pars["f_clk"], pars["f1"], pars["Vdc"]
    tfim = 4 / f1
    j = api("editor/rodar", {"dt": "1e-06", "tfim": f"{tfim:.6f}", "nome": "svm_api", "amostras": "1000000", "por_cima": "1"})
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.3)
        j = api("editor/rodada")
    ok(j.get("estado") == "fim", f"a rodada de 4 ciclos termina ({j.get('erro', j.get('estado'))})")
    d = np.load(j["arquivo"])
    t = d["t"]
    soma = d["T1_us"] + d["T2_us"] + d["T0_us"]
    vale = ~np.isnan(soma)
    ok(np.allclose(soma[vale], Ts * 1e6, atol=1e-6) and min(np.nanmin(d[k]) for k in ("T1_us", "T2_us", "T0_us")) > -1e-9,
       f"T1 + T2 + T0 = Ts = {Ts * 1e6:.0f} µs em toda amostra, nenhum negativo (soma de {np.nanmin(soma):.6f} a {np.nanmax(soma):.6f})")
    s = d["setor"]
    ciclo = (t >= 1 / f1) & (t < 2 / f1) & ~np.isnan(s)         # o 2º ciclo
    dur = [float(np.sum(s[ciclo] == k)) / float(np.sum(ciclo)) for k in range(1, 7)]
    ok(sorted(set(int(x) for x in s[ciclo])) == [1, 2, 3, 4, 5, 6] and all(abs(x - 1 / 6) < 0.01 for x in dur),
       f"o setor anda de 1 a 6, um sexto do ciclo cada um ({', '.join(f'{x:.3f}' for x in dur)})")
    v = np.rint(d["vetor"]).astype(int)
    fora = []
    for k in range(1, 7):                                       # fora o 1º período de cada setor (o registrador sombra)
        idx = np.flatnonzero(ciclo & (s == k))
        trechos = np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1)   # o trecho contínuo mais longo (o ciclo pode começar no meio de um setor)
        idx = max(trechos, key=len)
        ini = idx[0] + int(round(Ts / 1e-6)) + 2
        vistos = set(int(x) for x in v[ini:idx[-1]])
        if not vistos <= {0, 7, k, k % 6 + 1} or not {k, k % 6 + 1} <= vistos:
            fora.append((k, sorted(vistos)))
    ok(not fora, f"em cada setor, só os dois vetores ativos vizinhos e os nulos (fora do esperado: {fora})")
    troca = np.flatnonzero(np.diff(v[ciclo]) != 0)
    vv = v[ciclo]
    muda = [sum(a != b for a, b in zip(ESTADOS[int(vv[i])], ESTADOS[int(vv[i + 1])])) for i in troca]
    uma = sum(1 for x in muda if x == 1) / max(1, len(muda))    # na fronteira de dois setores um dos tempos é ~0: duas fases trocam no mesmo passo de 1 µs
    ok(len(muda) > 500 and uma > 0.95 and max(muda) <= 2, f"uma chave troca por vez ({len(muda)} trocas no ciclo, {100 * uma:.1f} % de uma fase só; as outras, nas fronteiras dos setores)")
    t_m = next((a["t"] for a in c.get("acionamentos", []) if a.get("alvo") == "p:m"), None)
    fund = lambda x, tt: 2 * abs(np.mean(x * np.exp(-2j * np.pi * f1 * tt)))
    a1 = (t >= 0) & (t < 1 / f1)                                # o 1º ciclo: m = 0,8
    a2 = (t >= 3 / f1) & (t < 4 / f1)                           # o 4º: m = 1
    v1, v2 = fund(d["v_ab"][a1], t[a1]), fund(d["v_ab"][a2], t[a2])
    ok(t_m is not None and 1 / f1 < t_m < 3 / f1 and abs(v1 / (pars["m"] * Vdc) - 1) < 0.02 and abs(v2 / Vdc - 1) < 0.02,
       f"a fundamental de v_ab: {v1:.1f} V com m = {pars['m']} (esperado {pars['m'] * Vdc:.0f}) e {v2:.1f} V com m = 1 (esperado {Vdc:.0f})")
    ok(max(float(np.max(d[f"g_{x}"] * d[f"n_{x}"])) for x in "abc") == 0.0, "as duas chaves de um braço nunca ligadas juntas")
except Exception as e:
    ok(False, f"o teste caiu: {e!r}")
api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
