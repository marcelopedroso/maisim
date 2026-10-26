"""Trocar de IA no meio da conversa (instância de teste 7201 com MAISIM_IA_TESTE=1: além do Claude de mentira, o "Eco", o
mesmo claude de mentira com outra pasta de configuração), etapa 2 do hub de IA (21/10): cada IA retoma a SUA sessão quando
volta; a que chega (ou que não viu o que a outra respondeu) recebe CONVERSA.md, a conversa no registro do MaiSim, e o pedido
cita; cada resposta guarda qual IA respondeu; /claude/ias lista as IAs. O Eco entra por chave de API (ia/base.py, ComChave):
a chave fica num arquivo 0600 na pasta dele, a página só vê o começo e os 4 últimos caracteres, e ela não vai para a pasta
da conversa, o histórico, as chamadas da IA nem o registro do servidor; sem a chave, o pedido ao Eco é recusado."""
import json, os, stat, subprocess, time, urllib.request
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
CHAVE = "sk-teste" + "0123456789abcdef" + "WXYZ"          # de mentira; o teste confere que ela não aparece em lugar nenhum
ARQ_CHAVE = ECO / "maisim" / "chave"
try:
    api("claude/ia/sair", {"ia": "eco"})
    ias = api("claude/ias")
    eco = next((a for a in ias if a["id"] == "eco"), {})
    ok([a["id"] for a in ias] == ["claude", "eco"] and all(a["instalado"] for a in ias) and eco.get("modo_login") == "chave"
       and eco.get("tem_login") and not eco["estado"]["logado"],
       f"/claude/ias: {[(a['id'], a['nome'], a['instalado'], a.get('modo_login')) for a in ias]} (o Eco, de chave, sem chave)")
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    r = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.002, "ia": "eco"})
    ok(r.get("ERRO") == 409 and "Eco" in r.get("erro", ""), f"sem a chave: o pedido ao Eco é recusado ({r.get('erro')})")
    r1 = api("claude/ia/codigo", {"ia": "eco", "codigo": "abc"})
    r2 = api("claude/ia/codigo", {"ia": "eco", "codigo": "pk-" + "x" * 30})
    ok(r1.get("ERRO") == 409 and "sk-" in r1.get("erro", "") and r2.get("ERRO") == 409 and not ARQ_CHAVE.exists(),
       f"chave mal formada: recusada sem guardar ({r1.get('erro')})")
    r = api("claude/ia/codigo", {"ia": "eco", "codigo": f"  {CHAVE}\n"})
    modo = stat.S_IMODE(os.stat(ARQ_CHAVE).st_mode) if ARQ_CHAVE.exists() else None
    ok(r.get("logado") and r.get("chave") == "sk-••••••••••WXYZ" and CHAVE not in json.dumps(r) and modo == 0o600
       and stat.S_IMODE(os.stat(ARQ_CHAVE.parent).st_mode) == 0o700 and ARQ_CHAVE.read_text().strip() == CHAVE,
       f"chave salva: 0600 ({oct(modo or 0)}) na pasta 0700, a resposta só com {r.get('chave')!r}")
    vistos = json.dumps([api("claude/ias"), api("claude/estado")], ensure_ascii=False)
    ok(CHAVE not in vistos and "sk-••••••••••WXYZ" in vistos, "a página nunca recebe a chave de volta (/claude/ias, /claude/estado)")
    u = api("claude/ia/uso?ia=eco")
    ok((u.get("saldo") or {}).get("valor") == 1.84, f"o saldo da IA de chave (o de mentira): {u.get('saldo')}")
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
    pasta_conv = CASA / "conversas"
    onde = [str(f) for f in [*pasta_conv.rglob("*"), CASA / "sessoes.json", CONF / "falso_chamadas.jsonl", ECO / "falso_chamadas.jsonl",
                             Path(ENV["MAISIM_DADOS"]) / "simu.log"] if f.is_file() and CHAVE.encode() in f.read_bytes()]
    ok(not onde, f"a chave não está na conversa, no histórico, nas chamadas da IA nem no registro do servidor {onde}")
    r = api("claude/ia/sair", {"ia": "eco"})
    ok(not r.get("logado") and not ARQ_CHAVE.exists() and r.get("chave") is None, "sair: a chave é apagada")
    api("claude/nova", {})
    s_nova = next((v for v in json.loads((CASA / "sessoes.json").read_text()).values() if v.get("id") == api("claude/contextos")["conversa"]), {})
    ok(not s_nova.get("sessoes"), "conversa nova: as sessões das IAs recomeçam")
finally:
    api("claude/ia/sair", {"ia": "eco"})
    for d in (CONF, ECO):
        for f in ("falso_logado", "falso_cenario"):
            (d / f).unlink(missing_ok=True)
    api("claude/descartar", {}); api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
