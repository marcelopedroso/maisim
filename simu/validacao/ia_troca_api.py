"""Trocar de IA no meio da conversa (instância de teste 7201 com MAISIM_IA_TESTE=1: além do Claude de mentira, o "Eco", o
mesmo claude de mentira com outra pasta de configuração), etapa 2 do hub de IA (21/10): cada IA retoma a SUA sessão quando
volta; a que chega (ou que não viu o que a outra respondeu) recebe CONVERSA.md, a conversa no registro do MaiSim, e o pedido
cita; cada resposta guarda qual IA respondeu; /claude/ias lista as IAs."""
import json, subprocess, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py") and ENV.get("MAISIM_IA_TESTE") == "1", "suba o servidor de teste (reinicia_servidor_teste.sh)"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
ECO = CONF.with_name("eco-maisim")
SALVOS, CASA = Path(ENV["MAISIM_SALVOS"]), Path(ENV["MAISIM_SIMU_CACHE"]) / "claude"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def espera(seg=90):
    for _ in range(int(seg / 0.4)):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.4)
    return e
def ultima(pasta):
    f = pasta / "falso_chamadas.jsonl"
    cs = [json.loads(x) for x in f.read_text().splitlines() if "stream-json" in x] if f.exists() else []
    return cs[-1]["args"] if cs else []
def prompt(args):
    return args[args.index("-p") + 1] if "-p" in args else ""
def sessao(args):
    return ("resume", args[args.index("--resume") + 1]) if "--resume" in args else ("nova", args[args.index("--session-id") + 1]) if "--session-id" in args else (None, None)


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
for d in (CONF, ECO):
    d.mkdir(parents=True, exist_ok=True)
    (d / "falso_logado").write_text("")
    (d / "falso_cenario").write_text("le_conversa")
    (d / "falso_chamadas.jsonl").unlink(missing_ok=True)
try:
    ias = api("claude/ias")
    ok([a["id"] for a in ias] == ["claude", "antigravity", "gemini", "eco"] and all(a["instalado"] for a in ias if a["id"] != "antigravity"),
       f"/claude/ias: {[(a['id'], a['nome'], a['instalado']) for a in ias]}")
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    sid = api("claude/contextos")["conversa"]
    api("claude/pedir", {"texto": "um", "dt": 1e-6, "tfim": 0.002, "ia": "claude"})
    e = espera()
    a1 = ultima(CONF)
    ok(sessao(a1) == ("nova", sid) and "CONVERSA.md" not in prompt(a1) and e["conversa"]["historico"][-1].get("ia") == "claude",
       f"1º pedido ao Claude: sessão nova = a conversa ({sid[:8]}…), sem CONVERSA.md, a resposta marcada \"claude\"")
    api("claude/pedir", {"texto": "dois", "dt": 1e-6, "tfim": 0.002, "ia": "eco"})
    e = espera()
    a2, h = ultima(ECO), e["conversa"]["historico"]
    s2 = sessao(a2)
    sessoes = json.loads((CASA / "sessoes.json").read_text())
    s_eco = next((v.get("sessoes", {}).get("eco") for v in sessoes.values() if v.get("id") == sid), None)
    ok(s2[0] == "nova" and s2[1] == s_eco and s2[1] != sid and "CONVERSA.md" in prompt(a2) and h[-1].get("resposta") == "li a conversa: 1 pedido(s)"
       and h[-1].get("ia") == "eco" and "Você é a IA do MaiSim (Eco (teste))" in a2[a2.index("--append-system-prompt") + 1],
       f"troca para o Eco: sessão própria ({str(s_eco)[:8]}…, guardada em sessoes.json), lê CONVERSA.md ({h[-1].get('resposta')!r}), marcada \"eco\", regras com o nome dele")
    api("claude/pedir", {"texto": "três", "dt": 1e-6, "tfim": 0.002, "ia": "claude"})
    e = espera()
    a3 = ultima(CONF)
    ok(sessao(a3) == ("resume", sid) and "CONVERSA.md" in prompt(a3) and e["conversa"]["historico"][-1].get("resposta") == "li a conversa: 2 pedido(s)",
       "de volta ao Claude: retoma a sessão dele e lê CONVERSA.md (o que o Eco respondeu)")
    api("claude/pedir", {"texto": "quatro", "dt": 1e-6, "tfim": 0.002, "ia": "claude"})
    e = espera()
    a4 = ultima(CONF)
    ok(sessao(a4) == ("resume", sid) and "CONVERSA.md" not in prompt(a4) and e["conversa"]["historico"][-1].get("resposta") == "sem CONVERSA.md",
       "Claude de novo, sem troca: não cita CONVERSA.md (a sessão dele já tem tudo)")
    api("claude/pedir", {"texto": "cinco", "dt": 1e-6, "tfim": 0.002, "ia": "eco"})
    e = espera()
    a5 = ultima(ECO)
    ok(sessao(a5) == ("resume", s_eco) and "CONVERSA.md" in prompt(a5) and e["conversa"]["historico"][-1].get("resposta") == "li a conversa: 4 pedido(s)",
       "de volta ao Eco: retoma a sessão DELE e lê CONVERSA.md (o que veio depois)")
    r = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.002, "ia": "nenhuma"})
    ok(r.get("ERRO") == 409 and "IA desconhecida" in r.get("erro", ""), f"IA desconhecida: recusado ({r.get('erro')})")
    api("claude/nova", {})
    s_nova = next((v for v in json.loads((CASA / "sessoes.json").read_text()).values() if v.get("id") == api("claude/contextos")["conversa"]), {})
    ok(not s_nova.get("sessoes"), "conversa nova: as sessões das IAs recomeçam")
finally:
    for d in (CONF, ECO):
        for f in ("falso_logado", "falso_cenario"):
            (d / f).unlink(missing_ok=True)
    api("claude/descartar", {}); api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
