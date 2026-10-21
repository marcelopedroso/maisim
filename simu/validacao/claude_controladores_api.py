"""O Claude do MaiSim cria controladores (instância de teste 7201, com o claude de mentira): o pedido de Marcelo em 19/10 —
"3 DSPs… se comunicando por fibra óptica… uma trava no Claude" (as regras não deixavam o Claude mexer nos controladores).
Agora a pasta do pedido tem controladores.json (quem roda à parte, o que lê e escreve, a latência da rede) e o Claude pode
editá-lo; o MaiSim valida (dono único de cada atuação), marca as atuações que os controladores escrevem, testa com eles, e
a aplicação vai para o histórico. Confere também a rodada de verdade com os 3 DSPs."""
import json, os, subprocess, time, urllib.request
from pathlib import Path
import numpy as np
RAIZ_PROJ = str(Path(__file__).resolve().parents[2])   # a raiz do projeto (validacao → simu → raiz)

B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
assert "maisim_teste" in str(CONF) or "/tmp/" in str(CONF), "MAISIM_CLAUDE_DIR tem de ser uma pasta descartável"
CONF.mkdir(parents=True, exist_ok=True)


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def pede(cenario, texto="faça 3 DSPs"):
    (CONF / "falso_cenario").write_text(cenario)
    (CONF / "falso_logado").write_text("")
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.002})
    if "ERRO" in r:
        return r
    for _ in range(120):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.5)
    return e


c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
api("editor/novo", {"modo": "descartar"}); api("claude/nova", {})
for a in (["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]):
    c("CREATE", a)
for nome, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "b"), ("L.1", "b", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["R.1", "R", 1.0]); c("SETP", ["L.1", "L", 1e-3])
c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "u_ctrl"])
api("editor/fonte_sinal", {"nome": "U.1", "sinal": "u_ctrl"})
c("OUTNODE", ["AMP.1", 0, "i_L"]); api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"})
ORQ = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    envia("dsp_a", {"x": 2.0})\n    envia("dsp_b", {"x": 3.0})\n    return {}\n'
api("editor/controle", {"controle": {"ativo": True, "Ts": 1e-5, "atuacoes": [], "parametros": [], "acionamentos": [], "controladores": [],
                                     "codigo": ORQ, "arquivos": {}}})
# 1. dois donos: o MaiSim acusa
e = pede("dois_donos")
p = e.get("proposta") or {}
ok(any("escrita por dois controladores" in x["msg"] for x in p.get("erros", [])), f"u_ctrl em dsp_a e dsp_b: o MaiSim acusa ({[x['msg'][:70] for x in p.get('erros', [])]})")
# 2. o pedido certo: 3 DSPs, a fibra de 20 µs
e = pede("controladores")
p = e.get("proposta") or {}
cs = p.get("controladores") or []
ok(not e.get("erro") and p.get("mudou") and [q["nome"] for q in cs] == ["controle", "dsp_a", "dsp_b"] and cs[1]["atuacoes"] == ["u_ctrl"]
   and abs((p.get("rede") or {}).get("latencia", 0) - 2e-5) < 1e-12 and not p.get("erros") and p.get("controladores_antes") == [],
   f"proposta: controladores {[(q['nome'], q['arquivo'], q['atuacoes']) for q in cs]}; rede {p.get('rede')}; erros {p.get('erros')}")
ok(p.get("marcar") == ["u_ctrl"] and "u_ctrl" in p.get("atuacoes", []), f"a atuação que o dsp_a escreve é marcada: {p.get('marcar')}")
cli = [json.loads(x) for x in (CONF / "falso_chamadas.jsonl").read_text().splitlines() if "--allowedTools" in x][-1]["args"]
ok("Edit(./controladores.json)" in cli, "o CLI pode editar ./controladores.json")
t = (api("claude/testar", {"dt": 1e-6}).get("proposta") or {}).get("teste") or {}
ok(t.get("ok"), f"▷ testar com os 3 controladores: {t.get('erro') or 'ok'}")
# 3. aplicar (como a página: o controle com a proposta, e a marca no histórico)
ctl = api("editor/controle")["controle"]
antes = {k: ctl[k] for k in ("codigo", "parametros", "acionamentos", "arquivos", "controladores", "rede")}
r = api("editor/controle", {"controle": dict(ctl, codigo=p["codigo"], arquivos=p["arquivos"], parametros=p["parametros"], acionamentos=p["acionamentos"],
                                             atuacoes=p["atuacoes"], controladores=p["controladores"], rede=p["rede"])})
ok(not r.get("ERRO") and not r.get("erros") and not r.get("erros_controladores") and [i["nome"] for i in r.get("instancias", [])] == ["controle", "dsp_a", "dsp_b"],
   f"aplicado: instâncias {[i['nome'] for i in r.get('instancias', [])]}; avisos {r.get('avisos')}")
api("claude/aplicada", {"antes": antes})
h = api("claude/estado") if False else None
m = api("claude/mudanca?i=1")
ok(m.get("controladores_antes") == [] and [q["nome"] for q in m.get("controladores", [])] == ["controle", "dsp_a", "dsp_b"] and m.get("rede", {}).get("latencia") == 2e-5,
   f"histórico (ver a mudança): controladores {[q['nome'] for q in m.get('controladores', [])]}, rede {m.get('rede')}")
# 4. a rodada de verdade: u_ctrl = 2 V a partir de quando a mensagem chega (fibra de 20 µs), i_L sobe para 2 A
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": "tres_dsps", "amostras": "100000"})
while j.get("estado") in ("rodando", "pausada", "preparando"):
    time.sleep(0.4); j = api("editor/rodada")
ok(j.get("estado") == "fim", f"rodada com os 3 DSPs: {j.get('estado')} {j.get('erro', '')}")
if j.get("estado") == "fim":
    arq = j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
    d = np.load(arq); tt, iL = d["t"], d["i_L"]
    ok(abs(iL[-1] - 2.0) < 0.02 and np.all(np.abs(iL[tt < 2e-5]) < 1e-9),
       f"i_L: 0 antes da mensagem chegar (t < 20 µs) e {iL[-1]:.4f} A no fim (u_ctrl = 2 V do dsp_a, R = 1 Ω)")
api("editor/novo", {"modo": "descartar"}); api("claude/nova", {})
(CONF / "falso_cenario").unlink(missing_ok=True); (CONF / "falso_logado").unlink(missing_ok=True)
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
