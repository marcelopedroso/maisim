"""O Google Antigravity como IA do MaiSim (21/10), na instância de teste (7201, MAISIM_IA_TESTE=1) com o agy de mentira
(agy_falso.py, MAISIM_AGY_BIN) numa casa descartável — nunca a conta Google de verdade nem o ~/.agy-maisim:
  o login (o menu respondido sozinho, o link, o código errado, o código certo, e a página que devolve o código sozinha),
  os modelos da conta (agy models) com o nome na tela, o pedido (as opções, a casa do MaiSim, as regras de negação na
  configuração, as regras do MaiSim só no começo da conversa), a resposta sem os links file:///, a proposta, a conversa do agy
  guardada e retomada, a troca com o Claude, o terminal negado (e ele segue), a parada por permissão (explicada), o erro,
  o login perdido, o resumo de um contexto e sair."""
import json, re, shutil, subprocess, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_AGY_BIN", "").endswith("agy_falso.py") and ENV.get("MAISIM_IA_TESTE") == "1", "suba o servidor de teste (reinicia_servidor_teste.sh)"
CASA_AGY = Path(ENV["MAISIM_AGY_DIR"])
assert CASA_AGY.resolve() != (Path.home() / ".agy-maisim").resolve(), "a instância de teste nunca usa o ~/.agy-maisim"
AGY = CASA_AGY / ".gemini" / "antigravity-cli"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
SALVOS, CASA, CTX = Path(ENV["MAISIM_SALVOS"]), Path(ENV["MAISIM_SIMU_CACHE"]) / "claude", Path(ENV["MAISIM_CONTEXTOS"])


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
def chamadas():
    f = CASA_AGY / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []
def ultima():
    cs = [c for c in chamadas() if "-p" in c["args"] and "stream-json" in c["args"]]
    return cs[-1] if cs else {"args": [], "cwd": "", "env": [], "settings": {}}
def cenario(c, casa=CASA_AGY):
    (casa / "falso_cenario").write_text(c)
def pede(texto, ia="antigravity", **extra):
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.01, "ia": ia, **extra})
    return r if "ERRO" in r else espera()
def agy():
    return next((a for a in api("claude/ias") if a["id"] == "antigravity"), {})
def vivos():
    out = []
    for d in Path("/proc").iterdir():
        try:
            if d.name.isdigit() and any(x.endswith(b"agy_falso.py") for x in (d / "cmdline").read_bytes().split(b"\0")):
                out.append(d.name)
        except OSError:
            pass
    return out
def entra_ate_o_link():
    e = api("claude/ia/entrar", {"ia": "antigravity"})
    return e, (e.get("login") or {})


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
shutil.rmtree(CASA_AGY, ignore_errors=True)
CASA_AGY.mkdir(parents=True)
CONF.mkdir(parents=True, exist_ok=True)
(CONF / "falso_logado").write_text("")
ids = []
try:
    # ---------------------------------------------------------------- a lista e o login
    a = agy()
    ok(a.get("nome") == "Google Antigravity" and a.get("instalado") and a.get("tem_login") and not a["estado"]["logado"]
       and a["estado"]["pasta"].endswith("agy-maisim") and a.get("esforcos") == [""],
       f"/claude/ias: o Google Antigravity, com login pelo MaiSim, deslogado, o esforço no nome do modelo (pasta {a.get('estado', {}).get('pasta')})")
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    r = pede("um pedido sem login")
    ok(r.get("ERRO") == 409 and "entre com a conta do Google Antigravity" in r.get("erro", ""), f"pedido sem login: recusado ({r.get('erro')})")
    e, l = entra_ate_o_link()
    lg = [c for c in chamadas() if "-p" not in c["args"] and c["args"][:1] != ["models"]]
    ok(l.get("andamento") and str(l.get("url", "")).startswith("https://accounts.google.com/o/oauth2/auth?") and "antigravity.google%2Foauth-callback" in l["url"]
       and lg and lg[-1]["tty"] and lg[-1]["args"] == [],
       "entrar: o agy interativo num terminal, o menu respondido sozinho (Google OAuth) e o link do Google")
    e = api("claude/ia/codigo", {"ia": "antigravity", "codigo": "4/codigo-ruim-999"})
    ok(not e.get("logado") and "o Google recusou o código (invalid_grant)" in str((e.get("login") or {}).get("erro")),
       f"código errado: {(e.get('login') or {}).get('erro')}")
    entra_ate_o_link()
    e = api("claude/ia/codigo", {"ia": "antigravity", "codigo": "4/codigo-bom-123"})
    time.sleep(0.5)
    ok(e.get("logado") and e.get("email") == "teste@gmail.com" and (AGY / "antigravity-oauth-token").exists() and not vivos(),
       f"código certo: conectado como {e.get('email')}; o agy interativo fechado ({len(vivos())} vivos)")
    a = agy()
    ok(a.get("modelos") == ["", "gemini-falso-high", "claude-falso-medium"] and a.get("rotulos", {}).get("gemini-falso-high") == "Gemini Falso (High)",
       f"os modelos da conta (agy models), com o nome: {a.get('rotulos')}")
    u = api("claude/ia/uso?ia=antigravity&forca=1")
    it = {i["rotulo"]: i for i in u.get("itens", [])}
    ok(list(it) == ["Gemini · semana", "Gemini · 5 h", "Claude e GPT · semana"] and it["Gemini · semana"]["pct"] == 25.0
       and it["Gemini · 5 h"]["pct"] == 0.8 and re.fullmatch(r"(hoje|amanhã) às \d\dh\d\d", it["Gemini · 5 h"]["renova"])
       and "Gemini Flash" in it["Gemini · semana"]["grupo"],
       f"os limites da conta (/usage do agy, 0 tokens): {[(k, v['pct'], v['renova']) for k, v in it.items()]}")
    api("claude/ia/sair", {"ia": "antigravity"})
    (CASA_AGY / "falso_login").write_text("auto")
    entra_ate_o_link()
    for _ in range(60):                                    # sem colar nada: o arquivo do login aparece e o MaiSim fecha o agy
        e = agy()["estado"]
        if e.get("logado") and not (e.get("login") or {}).get("andamento"):
            break
        time.sleep(0.25)
    time.sleep(0.5)
    ok(e.get("logado") and (e.get("login") or {}).get("mensagem") == "login feito" and e.get("email") == "teste@gmail.com" and not vivos(),
       f"a página do Antigravity devolve o código sozinha: o MaiSim reconhece pelo arquivo do login, a conta vem do log do agy ({e.get('email')}), e fecha o agy")
    (CASA_AGY / "falso_conta").write_text("outra.conta@gmail.com")
    api("claude/ia/uso?ia=antigravity&forca=1")            # o agy roda de novo (e o log dele diz a conta de agora)
    ok(agy()["estado"].get("email") == "outra.conta@gmail.com", "a conta é a do log mais novo do agy (trocou de conta: a tela acompanha)")
    (CASA_AGY / "falso_conta").unlink()
    (CASA_AGY / "falso_login").unlink()

    # ---------------------------------------------------------------- o pedido
    cenario("ganho")
    sid_conv = api("claude/contextos")["conversa"]
    e = pede("dobre o Kp e crie um K2", modelo="gemini-falso-high")
    c = ultima()
    a_ = c["args"]
    p = e.get("proposta") or {}
    par = {q["nome"]: q["valor"] for q in p.get("parametros", [])}
    ok(p.get("mudou") and par.get("K2") == 7.5 and "Antigravity falso" in str(p.get("codigo")), f"proposta: K2 = {par.get('K2')}, controle.py mudado")
    ok(e.get("resposta") == "Dobrei o **Kp** e criei o `K2` em `parametros.json`.", f"a resposta, sem o link file:/// ({e.get('resposta')!r})")
    ok(e.get("eventos", [])[:3] == ["lendo CONTEXTO.md", "editando parametros.json", "escrevendo controle.py"], f"o que ele fez: {e.get('eventos')}")
    h = e["conversa"]["historico"][-1]
    ok(h.get("ia") == "antigravity" and h.get("modelo") == "gemini-falso-high" and e["gasto"]["entrada"] == 3000 and e["gasto"]["saida"] == 350,
       f"marcada \"antigravity\", o modelo e o gasto ({e.get('gasto')})")
    sem_texto = [x for k, x in enumerate(a_) if not (k > 0 and a_[k - 1] in ("-p", "--conversation"))]
    ok(sem_texto == ["-p", "--output-format", "stream-json", "--sandbox", "--disable-slash-commands", "--model", "gemini-falso-high"],
       f"agy com exatamente estas opções: {sem_texto}")
    prompt1 = a_[a_.index("-p") + 1]
    ok(prompt1.startswith("Você é a IA do MaiSim (Google Antigravity)") and "NÃO tem terminal" in prompt1,
       "a 1ª chamada leva as regras do MaiSim no começo (e o aviso: sem terminal, sem nada fora da pasta)")
    ok(set(c["settings"].get("permissions", {}).get("deny", [])) >= {"command(*)", "unsandboxed(*)", "read_url(*)", "execute_url(*)", "mcp(*)"},
       f"as regras de negação na configuração do agy (casa do MaiSim): {c['settings'].get('permissions')}")
    vaza = [k for k in c["env"] if re.match(r"(ANTHROPIC|CLAUDE|GEMINI_API|GOOGLE|OPENAI|VERTEX)", k)]
    ok(not vaza and Path(c["cwd"]) == CASA / "conversas" / sid_conv, f"ambiente limpo ({vaza or 'nada vaza'}), na pasta da conversa")
    sess = json.loads((CASA / "sessoes.json").read_text())
    sid_agy = next((v.get("sessoes", {}).get("antigravity") for v in sess.values() if v.get("id") == sid_conv), None)
    ok(sid_agy and (AGY / "conversations" / f"{sid_agy}.db").exists(), f"a conversa do agy (o id que ele deu) guardada em sessoes.json ({str(sid_agy)[:8]}…)")
    api("claude/descartar", {})

    cenario("le_conversa")
    e = pede("dois")
    a_ = ultima()["args"]
    ok("--conversation" in a_ and a_[a_.index("--conversation") + 1] == sid_agy and e.get("resposta") == "sem CONVERSA.md",
       f"o 2º pedido retoma a conversa do agy (--conversation), sem as regras de novo nem CONVERSA.md ({e.get('resposta')!r})")
    cenario("le_conversa", CONF)
    e = pede("três", ia="claude")
    ok(e.get("resposta") == "li a conversa: 2 pedido(s)", f"Antigravity → Claude: o Claude lê CONVERSA.md ({e.get('resposta')!r})")
    e = pede("quatro")
    ok(e.get("resposta") == "li a conversa: 3 pedido(s)", f"Claude → Antigravity: retoma a conversa dele e lê CONVERSA.md ({e.get('resposta')!r})")

    # a trava
    cenario("terminal")
    e = pede("rode o controle no terminal")
    ok("Segui sem o terminal" in str(e.get("resposta")) and not e.get("erro") and "terminal (negado)" in e.get("eventos", []),
       f"o terminal: negado pela regra do MaiSim e ele segue ({str(e.get('resposta'))[:50]}…)")
    cenario("fora")
    e = pede("escreva fora da pasta")
    ok("tentou escrever fora da pasta, que o MaiSim não deixa, e parou" in str(e.get("erro")), f"escrever fora: o agy para e o MaiSim explica ({str(e.get('erro'))[:70]}…)")
    cenario("erro")
    e = pede("sem cota")
    ok("quota exceeded" in str(e.get("erro")), f"o erro do agy ({e.get('erro')})")

    # o resumo de um contexto pelo Antigravity
    cenario("ganho")
    r = api("claude/contexto/salvar", {"titulo": "pelo Antigravity", "resumo": "nota", "resumo_ia": True, "ia": "antigravity"})
    cid = r.get("id", ""); ids.append(cid)
    for _ in range(60):
        m = json.loads((CTX / cid / "meta.json").read_text()) if cid else {}
        if m.get("resumo_ia", {}).get("estado") != "gerando":
            break
        time.sleep(0.5)
    res = (CTX / cid / "resumo_ia.md").read_text() if cid and (CTX / cid / "resumo_ia.md").exists() else ""
    ok(m.get("resumo_ia", {}).get("estado") == "pronto" and "Antigravity leu conversa.md: 7 pedido(s)" in res and m.get("ia") == "antigravity",
       f"o resumo de um contexto pelo Antigravity: {m.get('resumo_ia', {}).get('estado')} ({res.splitlines()[-1] if res else '?'})")

    # o login perdido e sair
    (AGY / "antigravity-oauth-token").unlink()             # o login perdido (o arquivo do agy saiu)
    r = pede("sem login")
    ok(r.get("ERRO") == 409 and "entre com a conta do Google Antigravity" in r.get("erro", ""), "sem o arquivo do login: o pedido pede para entrar")
    (AGY / "antigravity-oauth-token").write_text("falso")
    e = api("claude/ia/sair", {"ia": "antigravity"})
    ok(not e.get("logado") and not (AGY / "antigravity-oauth-token").exists() and not e.get("email") and not (CASA_AGY / "maisim" / "conta.json").exists(),
       "sair: o arquivo do login sai da casa do MaiSim e a conta some da tela")
finally:
    for f in ("falso_logado", "falso_cenario"):
        (CONF / f).unlink(missing_ok=True)
    for f in ("falso_cenario", "falso_login", "falso_conta"):
        (CASA_AGY / f).unlink(missing_ok=True)
    for cid in ids:
        if cid:
            api("claude/contexto/apagar", {"id": cid})
    api("claude/descartar", {}); api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
