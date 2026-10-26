"""O Cursor como IA do MaiSim (25/10), na instância de teste (7201, MAISIM_IA_TESTE=1) com o Cursor CLI de mentira
(cursor_falso.py, MAISIM_CURSOR_BIN) numa casa descartável — nunca uma conta Cursor de verdade nem o ~/.cursor-maisim:
  a lista (instalado, deslogado, a casa), o pedido sem login, o login pela página (o link, a página que recusa, a que
  autoriza: o `agent` entra sozinho), os modelos da conta com o nome na tela, o pedido (as opções — sem --force —, a casa
  isolada, a política na configuração da casa e na da pasta, as regras no AGENTS.md), a proposta, a sessão do `agent`
  guardada e retomada, a troca com o Claude, as recusas (o terminal, fora da pasta, os arquivos só de leitura, a chave),
  os erros conhecidos (o limite, o login perdido, o modelo que a conta não tem, um erro qualquer), o resumo de um contexto,
  sair, e a chave de API (a forma, a recusada, a aceita: guardada 0600, só no ambiente do Cursor, nunca na página nem no
  registro do de mentira)."""
import json, re, stat, subprocess, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CURSOR_BIN", "").endswith("cursor_falso.py") and ENV.get("MAISIM_IA_TESTE") == "1", "suba o servidor de teste (reinicia_servidor_teste.sh)"
CASA_CUR = Path(ENV["MAISIM_CURSOR_DIR"])
assert CASA_CUR.resolve() != (Path.home() / ".cursor-maisim").resolve(), "a instância de teste nunca usa o ~/.cursor-maisim"
TOKEN = CASA_CUR / ".config" / "cursor" / "auth.json"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
SALVOS, CASA, CTX = Path(ENV["MAISIM_SALVOS"]), Path(ENV["MAISIM_SIMU_CACHE"]) / "claude", Path(ENV["MAISIM_CONTEXTOS"])
CHAVE_BOA = "crsr_bom_0123456789abcdefWXYZ"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
fim = lambda r: str(r or "").split("\n\n")[-1]   # a última mensagem do agent (a de antes da ferramenta vem antes, noutro parágrafo)

def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def espera(seg=90):
    for _ in range(int(seg / 0.4)):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.4)
    return e
def chamadas():
    f = CASA_CUR / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []
def ultima():
    cs = [c for c in chamadas() if "-p" in c["args"] and "stream-json" in c["args"]]
    return cs[-1] if cs else {"args": [], "cwd": "", "env": [], "config": {}, "projeto": {}}
def cenario(c, casa=CASA_CUR):
    (casa / "falso_cenario").write_text(c)
def pede(texto, ia="cursor", **extra):
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.01, "ia": ia, **extra})
    return r if "ERRO" in r else espera()
def cur():
    return next((a for a in api("claude/ias") if a["id"] == "cursor"), {})
def vivos():
    out = []
    for d in Path("/proc").iterdir():
        try:
            if d.name.isdigit() and any(x.endswith(b"cursor_falso.py") for x in (d / "cmdline").read_bytes().split(b"\0")):
                out.append(d.name)
        except OSError:
            pass
    return out
def ate(cond, seg=20):
    fim = time.time() + seg
    while time.time() < fim:
        v = cond()
        if v:
            return v
        time.sleep(0.25)
    return cond()


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
for f in ("falso_cenario", "falso_login", "falso_chamadas.jsonl"):
    (CASA_CUR / f).unlink(missing_ok=True)
TOKEN.unlink(missing_ok=True)
for f in ("chave", "conta.json", "modelos.json"):
    (CASA_CUR / "maisim" / f).unlink(missing_ok=True)
CONF.mkdir(parents=True, exist_ok=True)
(CONF / "falso_logado").write_text("")
ids = []
try:
    # ---------------------------------------------------------------- a lista e o login pela página
    a = cur()
    ok(a.get("nome") == "Cursor" and a.get("instalado") and a.get("tem_login") and not a["estado"]["logado"] and a.get("esforcos") == [""]
       and a["estado"]["pasta"].endswith("cursor-maisim") and a["estado"].get("entradas") == ["login", "chave"] and a.get("modelos") == [""],
       f"/claude/ias: o Cursor, com login pelo MaiSim, deslogado, a casa própria, o login antes da chave (pasta {a.get('estado', {}).get('pasta')})")
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    r = pede("um pedido sem login")
    ok(r.get("ERRO") == 409 and "entre com a conta do Cursor" in r.get("erro", ""), f"pedido sem login: recusado ({r.get('erro')})")
    e = api("claude/ia/entrar", {"ia": "cursor"})
    l = e.get("login") or {}
    lg = [c for c in chamadas() if c["args"][:1] == ["login"]]
    ok(l.get("andamento") and str(l.get("url", "")).startswith("https://cursor.com/loginDeepControl?") and lg and "NO_OPEN_BROWSER" in lg[-1]["env"]
       and lg[-1]["home"] == str(CASA_CUR) and not lg[-1]["tem_chave"],
       f"entrar: `agent login` na casa do MaiSim, sem abrir o navegador, e o link da página do Cursor ({str(l.get('url'))[:46]}…)")
    (CASA_CUR / "falso_login").write_text("erro")
    e = ate(lambda: (lambda x: x if not (x.get("login") or {}).get("andamento") else None)(cur()["estado"]))
    ok(e and not e.get("logado") and "authorization was denied" in str((e.get("login") or {}).get("erro")) and not vivos(),
       f"a página recusou: o erro do `agent` na tela ({(e or {}).get('login')})")
    (CASA_CUR / "falso_login").unlink()
    e = api("claude/ia/entrar", {"ia": "cursor"})
    e = api("claude/ia/cancelar", {"ia": "cursor"})
    ok(not e.get("logado") and not e.get("login") and ate(lambda: not vivos(), 5), "cancelar: o `agent login` fecha")
    api("claude/ia/entrar", {"ia": "cursor"})
    (CASA_CUR / "falso_login").write_text("ok")          # a pessoa autorizou na página: o `agent` entra sozinho
    e = ate(lambda: (lambda x: x if x.get("logado") and not (x.get("login") or {}).get("andamento") else None)(cur()["estado"]))
    ok(e and e.get("email") == "teste@cursor.local" and e.get("modo") == "login" and e.get("metodo") == "conta Cursor" and not vivos(),
       f"a página autorizou: conectado como {(e or {}).get('email')}, sem colar nada, e o `agent login` fechou")
    a = ate(lambda: (lambda x: x if len(x.get("modelos", [])) > 1 else None)(cur()), 10) or {}
    ok(a.get("modelos") == ["", "auto", "gpt-falso", "claude-falso-thinking"] and a.get("rotulos", {}).get("gpt-falso") == "GPT Falso",
       f"os modelos da conta (agent models), com o nome: {a.get('rotulos')}")
    (CASA_CUR / "falso_login").unlink()

    # ---------------------------------------------------------------- o pedido
    cenario("ganho")
    sid_conv = api("claude/contextos")["conversa"]
    e = pede("dobre o Kp e crie um K2", modelo="gpt-falso")
    c = ultima()
    a_ = c["args"]
    p = e.get("proposta") or {}
    par = {q["nome"]: q["valor"] for q in p.get("parametros", [])}
    ok(p.get("mudou") and par.get("K2") == 7.5 and "Cursor falso" in str(p.get("codigo")), f"proposta: K2 = {par.get('K2')}, controle.py mudado")
    ok(e.get("resposta") == "Vou ler o CONTEXTO.md.\n\nDobrei o **Kp** e criei o `K2`.", f"a resposta: as duas mensagens do agent, um parágrafo cada ({e.get('resposta')!r})")
    ok(e.get("eventos", [])[:3] == ["lendo CONTEXTO.md", "editando parametros.json", "editando controle.py"], f"o que ele fez: {e.get('eventos')}")
    h = e["conversa"]["historico"][-1]
    ok(h.get("ia") == "cursor" and h.get("modelo") == "GPT Falso" and e["gasto"]["entrada"] == 3000 and e["gasto"]["saida"] == 240,
       f"marcada \"cursor\", o modelo e o gasto ({h.get('modelo')}, {e.get('gasto')})")
    pasta = CASA / "conversas" / sid_conv
    sem_texto = a_[:-1]
    ok(sem_texto == ["-p", "--output-format", "stream-json", "--trust", "--sandbox", "disabled", "--disable-auto-update",
                     "--workspace", str(pasta.resolve()), "--model", "gpt-falso"] and a_[-1].startswith("Pedido do usuário"),
       f"agent com exatamente estas opções (sem --force), o pedido no fim: {sem_texto}")
    vaza = [k for k in c["env"] if re.match(r"(ANTHROPIC|CLAUDE|GEMINI|GOOGLE|OPENAI|DEEPSEEK|CURSOR_API_(KEY|ENDPOINT)|CURSOR_AUTH)", k)]
    ok(not vaza and c["home"] == str(CASA_CUR) and c["config_dir"] == str(CASA_CUR / ".cursor") and Path(c["cwd"]) == pasta,
       f"ambiente limpo ({vaza or 'nada vaza'}), a HOME e a configuração na casa do MaiSim, na pasta da conversa")
    pol = (c["config"] or {}).get("permissions") or {}
    P = str(pasta.resolve())
    ok(c["config"].get("approvalMode") == "allowlist" and (c["config"].get("sandbox") or {}).get("readBoundary") == "workspace"
       and {"Shell(*)", "WebFetch(*)", "Mcp(*:*)", f"Read({CASA_CUR.resolve()}/*)", f"Write({P}/CONTEXTO.md)", f"Write({P}/*/*)"} <= set(pol.get("deny", []))
       and f"Write({P}/controle.py)" in pol.get("allow", []) and f"Write({P}/*.py)" in pol.get("allow", []) and "Shell(ls)" not in pol.get("allow", [])
       and (c["projeto"] or {}).get("permissions") == pol,
       "a política do MaiSim na configuração da casa e na da pasta: allowlist, ler só na pasta, escrever só nos editáveis, sem terminal/web/MCP")
    ok("Você é a IA do MaiSim (Cursor)" in str(c.get("agents_md")), "as regras do MaiSim no AGENTS.md da pasta (com o nome do Cursor)")
    sess = json.loads((CASA / "sessoes.json").read_text())
    sid_cur = next((v.get("sessoes", {}).get("cursor") for v in sess.values() if v.get("id") == sid_conv), None)
    ok(sid_cur and any((CASA_CUR / ".cursor" / "chats").glob(f"*/{sid_cur}/store.db")),
       f"a sessão do agent (o id que ele deu) guardada em sessoes.json ({str(sid_cur)[:8]}…)")
    api("claude/descartar", {})

    cenario("le_conversa")
    e = pede("dois")
    a_ = ultima()["args"]
    ok("--resume" in a_ and a_[a_.index("--resume") + 1] == sid_cur and fim(e.get("resposta")) == "sem CONVERSA.md (com as regras do MaiSim)",
       f"o 2º pedido retoma a sessão do agent (--resume), sem citar CONVERSA.md ({e.get('resposta')!r})")
    cenario("le_conversa", CONF)
    e = pede("três", ia="claude")
    ok(e.get("resposta") == "li a conversa: 2 pedido(s)", f"Cursor → Claude: o Claude lê CONVERSA.md ({e.get('resposta')!r})")
    e = pede("quatro")
    a_ = ultima()["args"]
    ok(fim(e.get("resposta")) == "li a conversa: 3 pedido(s) (com as regras do MaiSim)" and a_[a_.index("--resume") + 1] == sid_cur,
       f"Claude → Cursor: retoma a sessão dele e lê CONVERSA.md ({e.get('resposta')!r})")

    # ---------------------------------------------------------------- as travas
    cenario("terminal")
    e = pede("rode o controle no terminal")
    ok("segui só com os arquivos" in str(e.get("resposta")) and not e.get("erro") and "terminal (negado)" in e.get("eventos", [])
       and any(x.startswith("recusado: o MaiSim não deixa: terminal") for x in e.get("eventos", [])),
       f"o terminal: negado pela política e ele segue ({e.get('eventos')})")
    fora = pasta.parent / "fora.txt"
    fora.unlink(missing_ok=True)
    cenario("fora")
    e = pede("escreva fora da pasta")
    ok(fim(e.get("resposta")) == "fora=False contexto=False anexo=False chave=False" and not fora.exists()
       and sum(x.startswith("recusado:") for x in e.get("eventos", [])) == 4,
       f"fora da pasta, o CONTEXTO.md, uma subpasta e a casa (a chave): negados ({e.get('resposta')})")
    cenario("erro")
    e = pede("um erro")
    ok("The model returned an error" in str(e.get("erro")), f"um erro do agent: a linha do erro ({e.get('erro')})")
    cenario("limite")
    e = pede("sem limite")
    ok("chegou ao limite de uso da sua conta" in str(e.get("erro")), f"o limite da conta: explicado ({e.get('erro')})")
    cenario("ganho")
    e = pede("modelo que sumiu", modelo="claude-falso-thinking")
    ok(not e.get("erro"), "um modelo da lista: vale")
    (CASA_CUR / "maisim" / "modelos.json").write_text(json.dumps([["auto", "Auto"], ["sumiu", "Sumiu"]]))
    e = pede("modelo que sumiu", modelo="sumiu")
    a = ate(lambda: (lambda x: x if "gpt-falso" in x.get("modelos", []) else None)(cur()), 10) or {}
    ok("não tem o modelo sumiu nesta conta" in str(e.get("erro")) and "sumiu" not in a.get("modelos", []),
       f"um modelo que a conta não tem mais: explicado, e a lista atualizada ({e.get('erro')})")

    # ---------------------------------------------------------------- o resumo de um contexto pelo Cursor
    cenario("ganho")
    r = api("claude/contexto/salvar", {"titulo": "pelo Cursor", "resumo": "nota", "resumo_ia": True, "ia": "cursor"})
    cid = r.get("id", ""); ids.append(cid)
    m = {}
    for _ in range(60):
        m = json.loads((CTX / cid / "meta.json").read_text()) if cid else {}
        if m.get("resumo_ia", {}).get("estado") != "gerando":
            break
        time.sleep(0.5)
    res = (CTX / cid / "resumo_ia.md").read_text() if cid and (CTX / cid / "resumo_ia.md").exists() else ""
    rc = [c for c in chamadas() if "-p" in c["args"] and "json" in c["args"]]
    ok(m.get("resumo_ia", {}).get("estado") == "pronto" and re.search(r"Cursor leu conversa\.md: \d+ pedido\(s\)", res) and m.get("ia") == "cursor"
       and rc and "--mode" in rc[-1]["args"] and not (CTX / cid / ".cursor").exists()
       and f"Write({(CTX / cid).resolve()}/*)" in rc[-1]["config"]["permissions"]["deny"],
       f"o resumo de um contexto pelo Cursor (modo ask, nenhuma escrita, nada a mais na pasta do contexto): {m.get('resumo_ia', {}).get('estado')}")

    # ---------------------------------------------------------------- o login perdido e sair
    cenario("sem_login")
    e = pede("login perdido")
    ok("pediu para entrar de novo" in str(e.get("erro")) and not cur()["estado"]["logado"], f"o login perdido: a tela pede para entrar ({e.get('erro')})")
    TOKEN.parent.mkdir(parents=True, exist_ok=True); TOKEN.write_text("falso")
    e = api("claude/ia/sair", {"ia": "cursor"})
    ok(not e.get("logado") and not TOKEN.exists() and not e.get("email") and not (CASA_CUR / "maisim" / "conta.json").exists()
       and any(c["args"][:1] == ["logout"] for c in chamadas()),
       "sair: `agent logout` (o próprio agent apaga o login dele) e a conta some da tela")

    # ---------------------------------------------------------------- a chave de API (CURSOR_API_KEY)
    r = api("claude/ia/codigo", {"ia": "cursor", "codigo": "curta demais"})
    ok(r.get("ERRO") == 409 and "não parece uma chave de API" in r.get("erro", ""), f"a forma da chave ({r.get('erro')})")
    ruim = "crsr_ruim_0123456789abcdef9999"
    r = api("claude/ia/codigo", {"ia": "cursor", "codigo": ruim})
    ok(r.get("ERRO") == 409 and "não aceitou a chave de API" in r.get("erro", "") and ruim not in json.dumps(r) and not (CASA_CUR / "maisim" / "chave").exists(),
       f"a chave recusada pelo agent: não guarda, e a mensagem não a repete ({r.get('erro')})")
    e = api("claude/ia/codigo", {"ia": "cursor", "codigo": f"  {CHAVE_BOA}\n"})
    arq = CASA_CUR / "maisim" / "chave"
    ok(e.get("logado") and e.get("modo") == "chave" and e.get("chave") == "••••••••••WXYZ" and CHAVE_BOA not in json.dumps(e)
       and arq.read_text().strip() == CHAVE_BOA and stat.S_IMODE(arq.stat().st_mode) == 0o600,
       f"a chave aceita: guardada 0600, a tela vê só os 4 últimos ({e.get('chave')})")
    ok(CHAVE_BOA not in json.dumps(api("claude/ias")), "a chave nunca volta na lista das IAs")
    cenario("ganho")
    e = pede("com a chave")
    c = ultima()
    ok(not e.get("erro") and c["tem_chave"] and "CURSOR_API_KEY" in c["env"] and CHAVE_BOA not in json.dumps(c["args"]),
       "o pedido com a chave: CURSOR_API_KEY só no ambiente do agent (nunca nos argumentos)")
    cenario("le_conversa", CONF)
    pede("e o Claude?", ia="claude")
    cl = [json.loads(x) for x in (CONF / "falso_chamadas.jsonl").read_text().splitlines()] if (CONF / "falso_chamadas.jsonl").exists() else []
    ok(CHAVE_BOA not in (CONF / "falso_chamadas.jsonl").read_text() and CHAVE_BOA not in (CASA_CUR / "falso_chamadas.jsonl").read_text()
       and CHAVE_BOA not in json.dumps(api("claude/pedido")) and cl,
       "a chave não aparece no registro dos de mentira, no estado do pedido nem no Claude")
    leak = [p for p in (CASA / "conversas").rglob("*") if p.is_file() and CHAVE_BOA in p.read_text(errors="replace")]
    ok(not leak, f"a chave não vai para a pasta da conversa nem para o histórico ({leak})")
    e = api("claude/ia/sair", {"ia": "cursor"})
    ok(not e.get("logado") and not arq.exists(), "sair: a chave é apagada")
finally:
    for f in ("falso_logado", "falso_cenario"):
        (CONF / f).unlink(missing_ok=True)
    for f in ("falso_cenario", "falso_login"):
        (CASA_CUR / f).unlink(missing_ok=True)
    for f in ("chave", "conta.json"):
        (CASA_CUR / "maisim" / f).unlink(missing_ok=True)
    TOKEN.unlink(missing_ok=True)
    for cid in ids:
        if cid:
            api("claude/contexto/apagar", {"id": cid})
    api("claude/descartar", {}); api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
