"""As correções da revisão do passo 2, pela API, na instância de teste (o circuito do teste_passo2 já está aberto)."""
import json, subprocess, threading, time, urllib.request
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read()), "codigo": e.code}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
base = api("editor/controle")["controle"]
cfg = dict(base, ativo=True, Ts=1e-4, atraso={"modo": "logo", "tempo": 0}, acionamentos=[])
api("editor/controle", {"controle": cfg})
# 1) dois POST /editor/rodar juntos: só um passa
res = []
def vai(): res.append(api("editor/rodar", {"dt": "1e-6", "tfim": "0.004", "nome": "duplo", "amostras": "100"}))
th = [threading.Thread(target=vai) for _ in range(2)]; [x.start() for x in th]; [x.join() for x in th]
recusados = [r for r in res if "ERRO" in r]
ok(len(recusados) == 1 and "rodando" in recusados[0]["ERRO"]["erro"], f"dois ▶ juntos: um roda, outro recusado ({recusados[0]['ERRO']['erro'] if recusados else res})")
# 2) com a simulação rodando, o controle não muda
r = api("editor/controle", {"controle": cfg})
ok(r.get("codigo") == 409, f"POST editor/controle durante a rodada: {r.get('codigo')} {r.get('ERRO', {}).get('erro', '')}")
while api("editor/rodada").get("estado") in ("preparando", "rodando", "pausada"): time.sleep(0.3)
# 3) configuração malformada: mensagem, não conexão derrubada
r = api("editor/controle", {"controle": {"acionamentos": ["x"]}}); ok(r.get("codigo") == 409 and "malformada" in r["ERRO"]["erro"], f"malformada: {r.get('codigo')} {r.get('ERRO')}")
r = api("editor/controle", {"controle": dict(cfg, atraso="logo")}); ok(r.get("codigo") == 409, f"atraso que não é objeto: {r.get('codigo')} {r.get('ERRO')}")
# 4) p[...] no último período: aviso, sem marca
api("editor/controle", {"controle": dict(cfg, acionamentos=[{"t": 0.00395, "alvo": "p:i_ref", "valor": 8}])})
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.004", "nome": "ultimo", "amostras": "100"})
while j.get("estado") in ("preparando", "rodando", "pausada"): time.sleep(0.3); j = api("editor/rodada")
import numpy as np
meta = json.loads(str(np.load(j["arquivo"])["meta"]))
ok(any("última amostra" in a for a in j.get("avisos", [])) and meta["acionamentos"] == [], f"p[...] no último período: aviso {j.get('avisos')} · marcas {meta['acionamentos']}")
# 5) dois acionamentos no mesmo passo: aviso de substituição, uma marca
api("editor/controle", {"controle": dict(cfg, acionamentos=[{"t": 0.0010001, "alvo": "CONST:v_dist", "valor": 5}, {"t": 0.0010002, "alvo": "CONST:v_dist", "valor": 7}])})
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.002", "nome": "repetido", "amostras": "100"})
while j.get("estado") in ("preparando", "rodando", "pausada"): time.sleep(0.3); j = api("editor/rodada")
meta = json.loads(str(np.load(j["arquivo"])["meta"]))
ok(any("substituído" in a for a in j.get("avisos", [])) and len(meta["acionamentos"]) == 1 and meta["acionamentos"][0]["valor"] == 7, f"mesmo passo: {j.get('avisos')} · marca {[(q['valor']) for q in meta['acionamentos']]}")
# 6) iniciar() com erro: rodada recusada e nenhum processo do controle pendurado
antes = int(subprocess.run("pgrep -fc 'controle_worker.py'", shell=True, capture_output=True, text=True).stdout.strip() or 0)
api("editor/controle", {"controle": dict(cfg, codigo='def iniciar(p, e):\n    raise KeyError("x")\n\n\ndef passo(t, m, p, e):\n    return {}\n')})
r = api("editor/rodar", {"dt": "1e-6", "tfim": "0.002", "nome": "falha", "amostras": "100"}); time.sleep(0.5)
depois = int(subprocess.run("pgrep -fc 'controle_worker.py'", shell=True, capture_output=True, text=True).stdout.strip() or 0)
ok("ERRO" in r and "linha 2" in r["ERRO"]["erro"] and depois == antes, f"iniciar() com erro: {r.get('ERRO', {}).get('erro')} · processos do controle antes {antes}, depois {depois}")
ok(api("editor/rodada").get("estado") != "preparando", f"estado depois da recusa: {api('editor/rodada').get('estado')}")
# 7) CONST com rótulo que começa por dígito vira alvo válido
api("editor/cmd", {"op": "OUTNODE", "args": ["CONST.2", 0, "5V"]}); r = api("editor/controle")
nomes = [a["nome"] for a in r["atuadores"]]; ok("_5V" in nomes, f"rótulo 5V vira {nomes}")
r = api("editor/controle", {"controle": dict(base, acionamentos=[{"t": 0.001, "alvo": "CONST:_5V", "valor": 1}])}); ok("ERRO" not in r, "acionamento em CONST:_5V aceito")
api("editor/cmd", {"op": "OUTNODE", "args": ["CONST.2", 0, "v_dist"]}); api("editor/controle", {"controle": base})
print("falhas:", falhas)
