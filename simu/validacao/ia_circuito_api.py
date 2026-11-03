"""A IA do MaiSim propõe valores do circuito (instância de teste 7201, com o claude de mentira, cenário "circuito"): a decisão
de Marcelo em 02/11 — o retificador com ΔV ≤ 10 %, a IA explica e propõe C.1 · C: 100 µF → 820 µF. A pasta do pedido tem o
circuito.json vazio (o CLI pode editá-lo) e o CONTEXTO.md traz os parâmetros do painel (nome do Gecko, valor, unidade) e as
variáveis $. O MaiSim confere cada item: o que vale volta com de → para; componente ou parâmetro que não existe, valor que
não é número, parâmetro ligado a uma variável $ e variável que não existe saem com um aviso. Nada muda antes de aplicar;
aplicar (como a página: um lote do editor) muda os valores, vai para o histórico da conversa, e o desfazer do editor volta."""
import json, subprocess, time, urllib.parse, urllib.request
from pathlib import Path

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


def pede(cenario, texto="o capacitor para ΔV ≤ 10 %"):
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


def valor(peca, par):                                    # o que o painel mostra (editor/params: o Gecko)
    lst = api(f"editor/params?nome={urllib.parse.quote(peca)}")
    return next((q.get("valor") for q in lst if q.get("nome") == par), None) if isinstance(lst, list) else None


def ativo(nome):
    return next((e["ativo"] for e in api("editor/estado")["folhas"]["0"]["elementos"] if e["nome"] == nome), None)


c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
var = lambda **k: api("editor/variavel", k)
api("editor/novo", {"modo": "descartar"}); api("claude/nova", {})
g0 = dict(api("editor/estado")["globais"])
for a in (("U.1", 10, 10, "U"), ("R.1", 20, 10, "R"), ("C.1", 30, 10, "C"), ("R.2", 40, 10, "R")):
    c("CREATE", *a)
for n in ("U.1", "R.1", "C.1", "R.2"):
    c("INNODE", n, 0, "a"); c("OUTNODE", n, 0, "gnd")
c("SETP", "U.1", "uDC", 10.0); c("SETP", "R.1", "R", 10.0); c("SETP", "C.1", "C", 1e-4)
c("CREATE", "SUBCIRCUIT.1", 50, 10, "SUBCIRCUIT"); c("CREATE", "SUBCIRCUIT.1#C.5", 20, 20, "C"); c("SETP", "SUBCIRCUIT.1#C.5", "C", 1e-6)
var(acao="nova", nome="$Vg", valor=5)
var(acao="liga", componente="R.2", parametro="R", nome="$Rl", valor=7)       # R.2 · R vem da variável $Rl
api("editor/controle", {"controle": {"ativo": False, "Ts": 1e-5, "atuacoes": [], "parametros": [], "acionamentos": [], "controladores": [],
                                     "codigo": "def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n", "arquivos": {}}})
ok(valor("C.1", "C") == 1e-4 and valor("SUBCIRCUIT.1#C.5", "C") == 1e-6, "o circuito: C.1 = 100 µF, SUBCIRCUIT.1#C.5 = 1 µF")

# 1. a proposta: duas mudanças válidas no circuito, uma dentro do subcircuito, desativar R.1 e uma variável; o resto sai com aviso
(CONF / "falso_circuito.json").write_text(json.dumps({"pecas": [
    {"peca": "C.1", "parametro": "C", "valor": 8.2e-4, "motivo": "ΔV ≤ 10 %"},
    {"peca": "SUBCIRCUIT.1#C.5", "parametro": "C", "valor": 2.2e-6},
    {"peca": "R.1", "parametro": "enabled", "valor": 0},
    {"peca": "R.1", "parametro": "R", "valor": 10.0},              # o mesmo valor: não é mudança
    {"peca": "C.9", "parametro": "C", "valor": 1e-3},              # não existe
    {"peca": "R.1", "parametro": "Xyz", "valor": 1.0},             # parâmetro que não existe
    {"peca": "U.1", "parametro": "uDC", "valor": "dez"},           # não é número
    {"peca": "R.2", "parametro": "R", "valor": 3.0}],              # ligado a $Rl: muda pela variável
    "globais": {"$Vg": 12.0, "$Nao": 1.0}}, ensure_ascii=False))
e = pede("circuito")
p = e.get("proposta") or {}
circ = {(q["peca"], q["parametro"]): q for q in p.get("circuito") or []}
ok(not e.get("erro") and p.get("mudou") and not p.get("ligar") and not p.get("erros"), f"proposta só do circuito: mudou, sem ligar o controle ({e.get('erro')}, {p.get('erros')})")
ok(e.get("resposta", "").startswith("circuito.json vazio na pasta"), f"o MaiSim pôs o circuito.json vazio na pasta: {e.get('resposta', '')[:60]}")
q = circ.get(("C.1", "C")) or {}
ok(q.get("de") == 1e-4 and q.get("para") == 8.2e-4 and "unidade" in q and q.get("motivo") == "ΔV ≤ 10 %", f"C.1 · C: de 100 µF para 820 µF, com a unidade e o motivo ({q})")
q = circ.get(("SUBCIRCUIT.1#C.5", "C")) or {}
ok(q.get("de") == 1e-6 and q.get("para") == 2.2e-6, f"dentro do subcircuito: SUBCIRCUIT.1#C.5 · C de 1 µF para 2,2 µF ({q})")
q = circ.get(("R.1", "enabled")) or {}
ok(q.get("de") == 1 and q.get("para") == 0, f"R.1 · enabled: de 1 para 0 (desativar) ({q})")
ok(len(circ) == 3, f"só as três válidas (o mesmo valor, C.9, Xyz, \"dez\" e R.2 ligado a $Rl ficam de fora): {sorted(circ)}")
ok(p.get("globais") == [{"nome": "$Vg", "de": 5.0, "para": 12.0}], f"a variável $Vg de 5 para 12 ($Nao não existe): {p.get('globais')}")
av = " | ".join(p.get("avisos") or [])
ok(all(x in av for x in ("C.9", "Xyz", "U.1", "$Rl", "$Nao")), f"os avisos dizem o que ficou de fora: {av[:300]}")
cli = [json.loads(x) for x in (CONF / "falso_chamadas.jsonl").read_text().splitlines() if "--allowedTools" in x][-1]
ok("Edit(./circuito.json)" in cli["args"], "o CLI pode editar ./circuito.json")
ctx = (Path(cli["cwd"]) / "CONTEXTO.md").read_text()
ok('"peca": "C.1"' in ctx and "`C` = 0.0001" in ctx and '"peca": "SUBCIRCUIT.1#C.5"' in ctx and "`$Rl`" in ctx and "`$Vg` = 5" in ctx,
   "CONTEXTO.md: os parâmetros do painel de cada componente (com o nome do subcircuito e a variável que dá o valor) e as variáveis $")
ok(valor("C.1", "C") == 1e-4 and ativo("R.1") is True and api("editor/estado")["globais"].get("$Vg") == 5, "nada muda antes de aplicar")

# 2. aplicar como a página: um lote do editor (uma linha no histórico) e a marca na conversa
cmds = [{"op": "SETP", "args": [q["peca"], q["parametro"], q["para"]]} for q in p.get("circuito") or []] + \
       [{"op": "SETG", "args": [g["nome"], g["para"]]} for g in p.get("globais") or []]
r = api("editor/cmds", {"cmds": cmds, "descr": "IA: C.1 · C: 100 µF → 820 µF"})
ok(not r.get("ERRO") and (r.get("desfazer") or {}).get("ultimo") == "IA: C.1 · C: 100 µF → 820 µF", f"aplicado num passo do editor: {r.get('erro') or (r.get('desfazer') or {}).get('ultimo')}")
ok(valor("C.1", "C") == 8.2e-4 and valor("SUBCIRCUIT.1#C.5", "C") == 2.2e-6 and ativo("R.1") is False and api("editor/estado")["globais"].get("$Vg") == 12,
   "C.1 = 820 µF, SUBCIRCUIT.1#C.5 = 2,2 µF, R.1 desativado, $Vg = 12")
api("claude/aplicada", {"aplicado": {"circuito": p.get("circuito"), "globais": p.get("globais")}})
m = api("claude/mudanca?i=0")
ok(len(m.get("circuito") or []) == 3 and m.get("globais") == p.get("globais"), f"o histórico da conversa guarda o circuito ({len(m.get('circuito') or [])} mudanças) e as variáveis")
# 3. o desfazer do editor volta tudo de uma vez
r = api("editor/desfazer", {})
ok(valor("C.1", "C") == 1e-4 and valor("SUBCIRCUIT.1#C.5", "C") == 1e-6 and ativo("R.1") is True and api("editor/estado")["globais"].get("$Vg") == 5,
   f"desfazer ({r.get('desfeito')}): C.1 = 100 µF, SUBCIRCUIT.1#C.5 = 1 µF, R.1 ativo, $Vg = 5")

# 4. circuito.json fora do formato: aviso, o circuito fica como está (e sem mudança, sem proposta do circuito)
(CONF / "falso_circuito.json").write_text('{"pecas": {"C.1": 1}}')
p = pede("circuito").get("proposta") or {}
ok(not p.get("circuito") and not p.get("globais") and any("circuito.json" in a for a in p.get("avisos") or []), f"fora do formato: nada do circuito, com aviso ({p.get('avisos')})")

api("editor/novo", {"modo": "descartar"}); api("claude/nova", {})
for k in set(api("editor/estado")["globais"]) - set(g0):   # o "novo" não apaga as variáveis: tira as do teste
    var(acao="apaga", nome=k)
for f in ("falso_cenario", "falso_logado", "falso_circuito.json"):
    (CONF / f).unlink(missing_ok=True)
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
