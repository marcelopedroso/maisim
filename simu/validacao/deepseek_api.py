"""A DeepSeek no MaiSim (ia/deepseek.py: o Claude Code com a chave de API da pessoa, numa pasta só dela), na instância de teste
7201 com o claude de mentira e MAISIM_DEEPSEEK_SEM_REDE=1 (nenhuma chamada à DeepSeek). Confere: a DeepSeek em /claude/ias
(modo da chave, V4 Pro e Flash, só o esforço padrão); sem a chave, o pedido é recusado; a chave mal formada recusada sem
guardar; a chave salva num arquivo 0600 na pasta 0700, mascarada, nunca de volta à página; o pedido vai com o
ANTHROPIC_BASE_URL da DeepSeek e a chave (o claude de mentira só registra sim/não), na pasta dela, com --model opus →
deepseek-v4-pro e sonnet → deepseek-flash; o pedido ao Claude sem nenhuma ANTHROPIC_*; a chave em nenhum arquivo da
conversa, nas chamadas nem no registro do servidor; sair apaga a chave. E, sem servidor, a leitura do saldo e a conferência
da chave com respostas de mentira da DeepSeek (o saldo em dólar, guardado 60 s; 401 recusa; sem rede, a chave fica)."""
import json, os, stat, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py") and ENV.get("MAISIM_DEEPSEEK_SEM_REDE") == "1" and ENV.get("MAISIM_DEEPSEEK_DIR"), \
    "suba o servidor de teste (reinicia_servidor_teste.sh)"
CONF, DS = Path(ENV["MAISIM_CLAUDE_DIR"]), Path(ENV["MAISIM_DEEPSEEK_DIR"])
SALVOS, CASA = Path(ENV["MAISIM_SALVOS"]), Path(ENV["MAISIM_SIMU_CACHE"]) / "claude"
CHAVE = "sk-" + "ds0123456789abcdef" + "9f3a"          # de mentira
ARQ = DS / "maisim" / "chave"


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
def chamadas(pasta):
    f = pasta / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines() if "stream-json" in x] if f.exists() else []
def pede(texto, ia, modelo="", esforco=""):
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.002, "ia": ia, "modelo": modelo, "esforco": esforco})
    return r if r.get("ERRO") else espera()


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
for d in (CONF, DS):
    d.mkdir(parents=True, exist_ok=True)
    (d / "falso_cenario").write_text("le_conversa")
    (d / "falso_chamadas.jsonl").unlink(missing_ok=True)
(CONF / "falso_logado").write_text("")
try:
    api("claude/ia/sair", {"ia": "deepseek"})
    ds = next((a for a in api("claude/ias") if a["id"] == "deepseek"), {})
    ok(ds.get("nome") == "DeepSeek" and ds.get("modo_login") == "chave" and ds.get("tem_login") and ds.get("instalado")
       and ds.get("modelos") == ["opus", "sonnet"] and ds.get("rotulos") == {"opus": "V4 Pro", "sonnet": "Flash"} and ds.get("esforcos") == [""]
       and not ds["estado"]["logado"] and ds["estado"]["pasta"].endswith("deepseek-maisim"),
       f"/claude/ias: a DeepSeek de chave, V4 Pro (opus) e Flash (sonnet), só o esforço padrão, sem chave ({ds.get('estado')})")
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    r = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.002, "ia": "deepseek", "modelo": "opus"})
    ok(r.get("ERRO") == 409 and "DeepSeek: conecte antes a chave de API" in r.get("erro", "") and not chamadas(DS), f"sem a chave: recusado, sem chamar o claude ({r.get('erro')})")
    rs = [api("claude/ia/codigo", {"ia": "deepseek", "codigo": c}) for c in ("abc", "pk-" + "x" * 30, "sk-curta", "sk-" + "x" * 20 + "!")]
    ok(all(x.get("ERRO") == 409 and "sk-" in x.get("erro", "") for x in rs) and not ARQ.exists(), f"chave mal formada: recusada sem guardar ({rs[0].get('erro')})")
    r = api("claude/ia/codigo", {"ia": "deepseek", "codigo": f"\n {CHAVE} \n"})
    modo = stat.S_IMODE(os.stat(ARQ).st_mode) if ARQ.exists() else 0
    ok(r.get("logado") and r.get("chave") == "sk-••••••••••9f3a" and CHAVE not in json.dumps(r) and modo == 0o600
       and stat.S_IMODE(os.stat(ARQ.parent).st_mode) == 0o700 and ARQ.read_text().strip() == CHAVE,
       f"chave salva: {r.get('chave')}, arquivo {oct(modo)} na pasta 0700 (sem rede: não conferida)")
    vistos = json.dumps([api("claude/ias"), api("claude/estado"), api("claude/ia/uso?ia=deepseek"), api("claude/pedido")], ensure_ascii=False)
    u = api("claude/ia/uso?ia=deepseek")
    ok(CHAVE not in vistos and not u.get("saldo") and u.get("itens") == [], "a chave não volta à página; sem rede, sem saldo (nenhuma chamada à DeepSeek)")
    # o pedido: a pasta dela, o endpoint e a chave no ambiente, o modelo pelo apelido
    e = pede("um", "deepseek", "opus")
    c = (chamadas(DS) or [{}])[-1]
    a, h = c.get("args", []), e["conversa"]["historico"][-1]
    amb = c.get("ambiente", {})
    ok(a[a.index("--model") + 1] == "opus" and amb.get("base_url_deepseek") and amb.get("token") and not amb.get("api_key")
       and amb.get("modelos") == {"opus": "deepseek-v4-pro", "sonnet": "deepseek-flash", "haiku": "deepseek-flash"}
       and h.get("ia") == "deepseek" and h.get("modelo") == "deepseek-v4-pro" and "--effort" not in a,
       f"V4 Pro: --model opus, ANTHROPIC_BASE_URL da DeepSeek e a chave (ANTHROPIC_AUTH_TOKEN) só no ambiente dela, respondeu {h.get('modelo')}")
    ok("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC" in amb.get("outras_anthropic", []) and "Você é a IA do MaiSim (DeepSeek)" in a[a.index("--append-system-prompt") + 1],
       "sem o tráfego não essencial para a Anthropic; as regras com o nome dela")
    e = pede("dois", "deepseek", "sonnet")
    c = (chamadas(DS) or [{}])[-1]
    ok(c["args"][c["args"].index("--model") + 1] == "sonnet" and e["conversa"]["historico"][-1].get("modelo") == "deepseek-flash" and "--resume" in c["args"],
       "Flash: --model sonnet → deepseek-flash, retomando a sessão dela")
    r1 = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.002, "ia": "deepseek", "modelo": ""})
    r2 = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.002, "ia": "deepseek", "modelo": "opus", "esforco": "high"})
    ok(r1.get("ERRO") == 409 and r2.get("ERRO") == 409, f"só V4 Pro e Flash, sem esforço: recusados ({r1.get('erro')})")
    e = pede("três", "claude")
    amb = (chamadas(CONF) or [{}])[-1].get("ambiente", {})
    ok(not amb.get("base_url") and not amb.get("token") and not amb.get("api_key") and not amb.get("outras_anthropic") and not amb.get("modelos"),
       f"o pedido ao Claude: nenhuma ANTHROPIC_* nem CLAUDE_CODE_* no ambiente dele ({amb.get('outras_anthropic')})")
    onde = [str(f) for f in [*(CASA / "conversas").rglob("*"), CASA / "sessoes.json", CONF / "falso_chamadas.jsonl", DS / "falso_chamadas.jsonl",
                             Path(ENV["MAISIM_DADOS"]) / "simu.log", *DS.rglob("projects/**/*")]
            if f.is_file() and CHAVE.encode() in f.read_bytes()]
    ok(not onde, f"a chave não está na conversa, no histórico, nas sessões, nas chamadas nem no registro do servidor {onde}")
    r = api("claude/ia/sair", {"ia": "deepseek"})
    r2 = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.002, "ia": "deepseek", "modelo": "opus"})
    ok(not r.get("logado") and not ARQ.exists() and r2.get("ERRO") == 409, "sair: a chave apagada, e o pedido à DeepSeek volta a ser recusado")
finally:
    api("claude/ia/sair", {"ia": "deepseek"})
    for d in (CONF, DS):
        for f in ("falso_logado", "falso_cenario"):
            (d / f).unlink(missing_ok=True)
    api("claude/descartar", {}); api("claude/nova", {})

# ---- sem servidor: o saldo e a conferência da chave, com as respostas da DeepSeek de mentira (nada vai à rede)
sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parents[2] / "config")]
os.environ.pop("MAISIM_DEEPSEEK_SEM_REDE", None)
from ia.deepseek import DeepSeek  # noqa: E402
with tempfile.TemporaryDirectory() as t:
    d = DeepSeek("/nao/existe/claude", t)
    resp, pedidos = [], []
    d._pede_saldo = lambda k: (pedidos.append(k == CHAVE), resp[0])[1]
    resp[:] = [(401, None)]
    try:
        d.codigo(CHAVE); ok(False, "chave recusada pela DeepSeek deveria falhar")
    except ValueError as x:
        ok("recusada (HTTP 401)" in str(x) and CHAVE not in str(x) and not d.arquivo_chave().exists(), f"401 na conferência: recusada, sem guardar ({x})")
    resp[:] = [(None, None)]
    ok(d.codigo(CHAVE)["logado"], "sem rede na conferência: a chave fica (o pedido dirá depois)")
    resp[:] = [(200, {"is_available": True, "balance_infos": [{"currency": "CNY", "total_balance": "10.00"}, {"currency": "USD", "total_balance": "1.84"}]})]
    u = d.uso()
    resp[:] = [(200, {"balance_infos": [{"currency": "USD", "total_balance": "0.50"}]})]
    u2, u3 = d.uso(), d.uso(forca=True)
    ok(u["saldo"] == {"valor": 1.84, "moeda": "USD"} and u2 == u and u3["saldo"]["valor"] == 0.5 and all(pedidos),
       f"o saldo: em dólar ({u['saldo']}), guardado 60 s, lido de novo ao forçar ({u3['saldo']}); a chave só no pedido")
    resp[:] = [(401, None)]
    ok(d.uso(forca=True) is None, "saldo sem resposta boa: nada (a barra fica vazia)")
    env = d.ambiente()
    ok(env.get("ANTHROPIC_AUTH_TOKEN") == CHAVE and env.get("ANTHROPIC_BASE_URL") == "https://api.deepseek.com/anthropic" and env.get("CLAUDE_CONFIG_DIR") == str(Path(t).resolve()),
       "o ambiente da DeepSeek: a chave, o endpoint e a pasta dela")
    d.sai()
    ok("ANTHROPIC_AUTH_TOKEN" not in d.ambiente() and d.uso() is None, "depois de sair: sem a chave no ambiente e sem saldo")
raise SystemExit(1 if falhas else 0)
