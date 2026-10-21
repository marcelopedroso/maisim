"""A comparação Gecko × arquivo (pendente) na instância de teste: sem falso alarme ao abrir e depois de rodar; pega as
edições que a versão anterior não via (campo fora da lista, o que o medidor mede, desativar)."""
import json, time, urllib.request
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
pend = lambda: api("editor/pendente").get("pendente")
for arq in ("exemplos/exemplo_controle_pwm.ipes", "exemplos/exemplo_cascata_hb.ipes"):
    api("editor/abrir", {"arq": arq, "modo": "descartar"})
    ok(pend() is False, f"aberto sem mexer, nada pendente: {arq.split('/')[-1]}")
PI = "exemplos/exemplo_controle_pi.ipes"
api("editor/abrir", {"arq": PI, "modo": "descartar"})
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.002", "nome": "assin", "amostras": "100"})
while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
ok(j.get("estado") == "fim" and pend() is False, f"depois de uma rodada (2 ms, outro tfim), nada pendente ({j.get('estado')})")
for nome, cmd in (("U.1 upperLimit (fora da lista antiga)", {"op": "SETP", "args": ["U.1", "upperLimit", 50.0]}),
                  ("U.1 offset", {"op": "SETP", "args": ["U.1", "offset", 1.5]})):
    api("editor/abrir", {"arq": PI, "modo": "descartar"}); r = api("editor/cmd", cmd)
    ok("ERRO" not in r and pend() is True, f"{nome}: pendente ({r.get('erro', 'ok')})")
api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
r = api("editor/cmd", {"op": "SETP", "args": ["D.1", "uF", 0.9]}); ok("ERRO" not in r and pend() is True, f"D.1 uF (queda do diodo): pendente ({r.get('erro', 'ok')})")
api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
r = api("editor/mede", {"nome": "VOLT.2", "tipo": "V", "no1": "sw", "no2": "gnd"}); ok("ERRO" not in r and pend() is True, f"VOLT.2 passa a medir outro nó: pendente ({r.get('erro', 'ok')})")
api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
print("falhas:", falhas)
