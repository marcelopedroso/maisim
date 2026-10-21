"""Atuações no fluxo de módulos (instância de teste 8768, com o claude de mentira): o achado de Marcelo em 19/10 — o
controle.py monta u = {"sm_ap_1_s": …} e devolve escrita.passo(u, …); ao aplicar a proposta do Claude do PEW, o PEW só
procurava as chaves num return {…} literal, não marcava nada, e o testar avisava "não é atuação marcada (a rodada
pararia)". Confere: a proposta marca a atuação escrita em u = {…} (e em u["x"] = …, dict(x=…) e num módulo); o return {…}
de antes continua marcando; um dicionário com chave que não é atuador não marca nada; o validador do editor sublinha a
chave de atuador não marcada fora do return; e, marcada, o testar não avisa mais."""
import json, os, subprocess, time, urllib.request
from pathlib import Path

B = "http://localhost:8768/pew/simu/"
PID = subprocess.run("ss -ltnp | grep ':8768 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("PEW_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF = Path(ENV["PEW_CLAUDE_DIR"])
assert "pew_simu_teste" in str(CONF) or "/tmp/" in str(CONF), "PEW_CLAUDE_DIR tem de ser uma pasta descartável"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-PEW": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
# o circuito: RL com fonte controlada pelo CONST u_ctrl, i_L medida (o do teste_controle)
api("editor/novo", {"modo": "descartar"})
for a in (["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]):
    c("CREATE", a)
for nome, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "b"), ("L.1", "b", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "u_ctrl"])
api("editor/fonte_sinal", {"nome": "U.1", "sinal": "u_ctrl"})
c("OUTNODE", ["AMP.1", 0, "i_L"]); api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"})
r = api("editor/controle")
ok([a["nome"] for a in r.get("atuadores", [])] == ["u_ctrl"], f"o circuito tem o atuador u_ctrl ({[a['nome'] for a in r.get('atuadores', [])]})")
PARS = [{"nome": "Kp", "valor": 1.0, "unidade": "V/A"}]
LEITURA = 'def iniciar(p):\n    return {}\n\n\ndef passo(m, p, estado):\n    return dict(m)\n'
ESCRITA = 'def iniciar(p):\n    return {}\n\n\ndef passo(u, p, estado):\n    return dict(u)\n'
ORQ = '''import leitura
import escrita


def iniciar(p, e):
    e["leitura"], e["escrita"] = leitura.iniciar(p), escrita.iniciar(p)


def passo(t, m, p, e):
    x = leitura.passo(m, p, e["leitura"])
    e["hist"] = {"nao_atuador": 1.0}          # um dicionário qualquer: não é saída
    {SAIDA}
'''
CASOS = [("u = {...} e return escrita.passo(u, …) (o caso de Marcelo)", 'u = {"u_ctrl": p["Kp"] * x["i_L"]}\n    return escrita.passo(u, p, e["escrita"])', {}),
         ('u["u_ctrl"] = …', 'u = {}\n    u["u_ctrl"] = 1.0\n    return escrita.passo(u, p, e["escrita"])', {}),
         ("dict(u_ctrl=…)", 'return escrita.passo(dict(u_ctrl=1.0), p, e["escrita"])', {}),
         ("a chave num módulo (escrita.py)", 'return escrita.passo({}, p, e["escrita"])',
          {"escrita.py": ESCRITA.replace("return dict(u)", 'return dict(u, u_ctrl=0.0)')}),
         ("return {...} (como antes dos módulos)", 'return {"u_ctrl": 1.0}', {})]


def pede():
    (CONF / "falso_cenario").write_text("ganho")
    r = api("claude/pedir", {"texto": "dobre o Kp", "dt": 1e-6, "tfim": 0.01})
    if "ERRO" in r:
        return r
    for _ in range(120):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.5)
    return e


for titulo, saida, extra in CASOS:
    arqs = {"leitura.py": LEITURA, "escrita.py": ESCRITA, **extra}
    r = api("editor/controle", {"controle": {"ativo": True, "Ts": 1e-4, "atuacoes": [], "parametros": PARS, "controladores": [],
                                             "codigo": ORQ.replace("{SAIDA}", saida), "arquivos": arqs}})
    if titulo.startswith("u = {...}"):
        sub = [x for x in r.get("conferencia", []) if "u_ctrl" in x["msg"]]
        ok(len(sub) == 1 and "não está marcado em atuações" in sub[0]["msg"] and not any("nao_atuador" in x["msg"] for x in r.get("conferencia", [])),
           f"validador: sublinha o \"u_ctrl\" do u = {{...}} na linha {sub[0]['linha'] if sub else '?'} (\"{sub[0]['msg'] if sub else ''}\"); o dicionário qualquer não")
        t = api("editor/controle/testar", {"dt": 1e-6})
        ok(t.get("ok") and all(q["fora"] == ["u_ctrl"] for q in t["passos"]), f"sem marcar, o testar avisa o que a rodada faria: fora = {[q['fora'] for q in t.get('passos', [])]}")
    e = pede()
    p = e.get("proposta") or {}
    ok(not e.get("erro") and p.get("marcar") == ["u_ctrl"] and "u_ctrl" in p.get("atuacoes", []) and "nao_atuador" not in p.get("atuacoes", []),
       f"{titulo}: a proposta marca {p.get('marcar')} (atuações {p.get('atuacoes')}) {e.get('erro') or ''}")
# marcada (como a página faz ao aplicar), o testar não avisa mais
r = api("editor/controle", {"controle": {"ativo": True, "Ts": 1e-4, "atuacoes": ["u_ctrl"], "parametros": PARS, "controladores": [],
                                         "codigo": ORQ.replace("{SAIDA}", CASOS[0][1]), "arquivos": {"leitura.py": LEITURA, "escrita.py": ESCRITA}}})
t = api("editor/controle/testar", {"dt": 1e-6})
ok(t.get("ok") and all(not q["fora"] and "u_ctrl" in q["a"] for q in t["passos"]) and not any("u_ctrl" in x["msg"] for x in r.get("conferencia", [])),
   f"marcada: o testar devolve u_ctrl sem aviso ({[q['a'] for q in t.get('passos', [])]}) e o validador não sublinha mais")
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
