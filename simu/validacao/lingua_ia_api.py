"""A IA do MaiSim no idioma de quem pede (o MaiSim bilíngue, PR 11) — instância de teste (7201), com o claude de mentira
(validacao/claude_falso.py, como no claude_pedido_api.py e no claude_autonomo_api.py). Um pedido com o cookie
maisim-lingua=en, no modo autônomo de uma rodada: as regras, o pedido e o CONTEXTO.md em inglês ("User request:", "…Answer
in English.)"), a volta da rodada em inglês, o resumo.md da rodada em inglês com a linha "- modelo: …" do protocolo (o servidor
a lê para achar as rodadas do circuito); um 2º pedido em inglês: CONVERSA.md com "## 1. Request". Sem o cookie, o pedido em
português, como sempre ("Pedido do usuário:", "…Responda em português.)")."""
import json
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
assert "maisim_teste" in str(CONF) or "/tmp/" in str(CONF), "MAISIM_CLAUDE_DIR tem de ser uma pasta descartável (reinicia_servidor_teste.sh)"
CASA = Path(ENV["MAISIM_SIMU_CACHE"]) / "claude"
RODADAS = Path(ENV["MAISIM_RODADAS"])
SALVOS = Path(ENV["MAISIM_SALVOS"])
CONF.mkdir(parents=True, exist_ok=True)
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def api(rota, corpo=None, lingua=None):
    h = {"Content-Type": "application/json", "X-MaiSim": "1"}
    if lingua:
        h["Cookie"] = f"tema=claro; maisim-lingua={lingua}"
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


def chamadas():                                          # as chamadas de pedido (as do uso da conta ficam de fora)
    f = CONF / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines() if "stream-json" in x] if f.exists() else []


def arg(c, nome):
    a = c["args"]
    return a[a.index(nome) + 1] if nome in a else ""


def espera(lingua=None, seg=240):
    for _ in range(int(seg / 0.5)):
        e = api("claude/pedido", lingua=lingua)
        if not e.get("andamento"):
            return e
        time.sleep(0.5)
    return e


REPO = Path(__file__).resolve().parent / "dados"           # o exemplo congelado (o do repositório muda)
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    shutil.copy(REPO / f, SALVOS / f)
ex = SALVOS / "exemplo_controle_pwm.ipes"
(CONF / "falso_logado").write_text("")
(CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
antes_rod = set(RODADAS.glob("*_Claude_*"))
try:
    r = api("editor/abrir", {"arq": str(ex), "modo": "descartar"})
    ok("ERRO" not in r, f"exemplo do buck aberto ({r.get('erro', 'ok')})")
    api("claude/nova", {})

    # ---- 1º pedido em inglês, no modo autônomo de uma rodada (versão 1 → a rodada Claude_1 → a volta → fim das rodadas)
    (CONF / "falso_cenario").write_text("autonomo")
    r = api("claude/pedir", {"texto": "double Kp", "dt": 1e-6, "tfim": 0.002, "autonomo": 1}, lingua="en")
    e = espera("en")
    cs = chamadas()
    p1 = arg(cs[0], "-p") if cs else ""
    ok("ERRO" not in r and len(cs) == 2 and not e.get("erro"), f"o pedido em inglês: {len(cs)} chamadas (a 1ª e a volta da rodada), erro {e.get('erro')!r}")
    ok(p1.startswith("User request:\n\ndouble Kp\n\n(MaiSim: the files in the folder were rewritten") and p1.endswith("Answer in English.)"),
       f"o pedido em inglês: \"User request:\" … \"Answer in English.)\" ({p1[:40]!r} … {p1[-30:]!r})")
    regras = arg(cs[0], "--append-system-prompt") if cs else ""
    ok(regras.startswith("You are MaiSim's Claude, a power electronics simulator") and "Answer in English" in regras and "Responda em" not in regras,
       f"as regras em inglês ({regras[:50]!r}…)")
    p2 = arg(cs[1], "-p") if len(cs) > 1 else ""
    ok(p2.startswith("(MaiSim, autonomous mode) Run 1 of 1 of your version finished: finished.") and p2.endswith("Answer in English."),
       f"a volta da rodada em inglês ({p2[:80]!r}…)")
    pc = CASA / "conversas" / str(e.get("pasta"))
    ctx = (pc / "CONTEXTO.md").read_text() if (pc / "CONTEXTO.md").exists() else ""
    ok(ctx.startswith("# MaiSim context\n") and "## Measurements (m[\"name\"] in the code)" in ctx and "tfim = 0.002 s" in ctx
       and "## Current events (acionamentos.json)" in ctx and "Contexto do MaiSim" not in ctx and "Medidas" not in ctx,
       f"CONTEXTO.md em inglês ({ctx.splitlines()[:1]})")
    novas = sorted(set(RODADAS.glob("*_Claude_*")) - antes_rod)
    res = (novas[0] / "resumo.md").read_text() if novas and (novas[0] / "resumo.md").exists() else ""
    linhas = res.splitlines()
    ok(len(novas) == 1 and res.startswith("# Run summary ") and any(x.startswith("- modelo: ") for x in linhas[:6])
       and "- final state: finished" in res and "## Steady state (last window, J5)" in res,
       f"o resumo.md da rodada {novas[0].name if novas else '—'} em inglês, com a linha \"- modelo:\" do protocolo")
    ult = (pc / "ULTIMA_RODADA.md").read_text() if (pc / "ULTIMA_RODADA.md").exists() else ""
    ok(ult.startswith("# Run summary ") and "Claude_1" in ult.splitlines()[0], f"a IA leu essa rodada em ULTIMA_RODADA.md ({ult.splitlines()[:1]})")
    api("claude/descartar", {}, lingua="en")

    # ---- 2º pedido em inglês: a conversa até aqui em CONVERSA.md, com "## 1. Request"
    (CONF / "falso_cenario").write_text("le_conversa")
    api("claude/pedir", {"texto": "and now?", "dt": 1e-6, "tfim": 0.002}, lingua="en")
    e = espera("en")
    conv = (pc / "CONVERSA.md").read_text() if (pc / "CONVERSA.md").exists() else ""
    ok(conv.startswith("# Conversation — this conversation") and "## 1. Request" in conv and "## 2. Request" in conv and "Pedido" not in conv,
       f"CONVERSA.md em inglês: \"## 1. Request\" ({len(conv)} caracteres)")
    api("claude/descartar", {}, lingua="en")

    # ---- sem o cookie: português, como sempre
    api("claude/nova", {})
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    (CONF / "falso_cenario").write_text("ganho")
    api("claude/pedir", {"texto": "dobre o Kp", "dt": 1e-6, "tfim": 0.002})
    e = espera()
    cs = chamadas()
    p = arg(cs[-1], "-p") if cs else ""
    ctx = (CASA / "conversas" / str(e.get("pasta")) / "CONTEXTO.md")
    ctx = ctx.read_text() if ctx.exists() else ""
    ok(p.startswith("Pedido do usuário:\n\ndobre o Kp") and p.endswith("Responda em português.)") and ctx.startswith("# Contexto do MaiSim\n")
       and arg(cs[-1], "--append-system-prompt").startswith("Você é o Claude do MaiSim"),
       "sem o cookie: o pedido, as regras e o CONTEXTO.md em português")
finally:
    for f in ("falso_logado", "falso_cenario"):
        (CONF / f).unlink(missing_ok=True)
    api("claude/descartar", {})
    api("claude/nova", {})
    for p in set(RODADAS.glob("*_Claude_*")) - antes_rod:   # as rodadas que o teste fez
        shutil.rmtree(p, ignore_errors=True)
    api("editor/abrir", {"arq": str(ex), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
