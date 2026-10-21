"""Compensação do atraso do Gecko nos quatro caminhos do CONST até o destino: CONST → GATE, CONST → GAIN → GATE (buck,
chave) e CONST → fonte, CONST → GAIN → fonte (RL). Um acionamento do CONST em t = 8 µs (Δt = 1 µs) tem de ser sentido pelo
circuito a partir do passo 8 nos quatro (sem a compensação: passos 7, 8, 8 e 9). Instância de teste (7201)."""
import json, urllib.request, subprocess, sys
import numpy as np
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
c = lambda op, args: (lambda r: (print("ERRO", op, args, r["ERRO"]) if "ERRO" in r else None, r)[1])(api("editor/cmd", {"op": op, "args": args}))
def monta(destino, com_gain):
    api("editor/novo", {"descartar": True})
    if destino == "chave":
        for a in (["U.1", 6, 12, "U"], ["S.1", 14, 6, "S"], ["D.1", 20, 12, "D"], ["L.1", 26, 6, "L"], ["R.1", 32, 12, "R"]): c("CREATE", a)
        for nome, i, o in (("U.1", "vin", "gnd"), ("S.1", "vin", "sw"), ("D.1", "gnd", "sw"), ("L.1", "sw", "o"), ("R.1", "o", "gnd")):
            c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
        c("SETP", ["U.1", "uDC", 100.0])
    else:
        for a in (["U.1", 6, 12, "U"], ["L.1", 26, 6, "L"], ["R.1", 32, 12, "R"]): c("CREATE", a)
        for nome, i, o in (("U.1", "vin", "gnd"), ("L.1", "vin", "o"), ("R.1", "o", "gnd")):
            c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
    c("SETP", ["L.1", "L", 1e-3]); c("SETP", ["R.1", "R", 2.0])
    for a in (["CONST.1", 8, 20, "CONST"], ["AMP.1", 40, 16, "AMP"]): c("CREATE", a)
    c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["AMP.1", 0, "i_L"])
    api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"})
    sinal = "s"
    if com_gain:
        c("CREATE", ["GAIN.1", 12, 20, "GAIN"]); c("OUTNODE", ["CONST.1", 0, "s0"]); c("INNODE", ["GAIN.1", 0, "s0"]); c("OUTNODE", ["GAIN.1", 0, "s"])
    else:
        c("OUTNODE", ["CONST.1", 0, "s"])
    if destino == "chave":
        c("CREATE", ["GATE.1", 16, 20, "GATE"]); c("INNODE", ["GATE.1", 0, "s"])
        r = api("editor/mede", {"nome": "GATE.1", "tipo": "G", "componente": "S.1"}); assert "ERRO" not in r, r
    else:
        r = api("editor/fonte_sinal", {"nome": "U.1", "sinal": "s"}); assert "ERRO" not in r, r
    return r
import time
for destino in ("chave", "fonte"):
    for com_gain in (False, True):
        monta(destino, com_gain)
        alvo = "CONST:s0" if com_gain else "CONST:s"
        cfg = {"ativo": False, "Ts": 1e-6, "atuacoes": [], "parametros": [], "codigo": "def passo(t, m, p, e):\n    return {}\n",
               "atraso": {"modo": "logo", "tempo": 0}, "acionamentos": [{"t": 8e-6, "alvo": alvo, "valor": 1.0}]}
        r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r, r
        j = api("editor/rodar", {"dt": "1e-06", "tfim": "2e-05", "nome": "atraso", "amostras": "100000"})
        while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.2); j = api("editor/rodada")
        d = np.load(j["arquivo"]); t, i = d["t"], d["i_L"]
        k = int(np.argmax(np.abs(i) > 5e-4))
        print(f"{destino:5s} {'CONST → GAIN → ' if com_gain else 'CONST → '}{'GATE' if destino == 'chave' else 'fonte'}: acionamento em t = 8 µs "
              f"(pedido: o circuito sente a partir do passo 8); i_L responde primeiro na amostra t = {t[k]*1e6:.0f} µs → sentiu no passo {k - 1}"
              f" · {'OK' if k - 1 == 8 else 'FALHA'} · i(6..10 µs) = {np.round(i[6:11], 5)}")
