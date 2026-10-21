"""O Gemini como IA do PEW (etapa 3 do hub de IA, 21/10), na instância de teste (8768, PEW_IA_TESTE=1) com o gemini de
mentira (gemini_falso.py, PEW_GEMINI_BIN) numa pasta descartável — nunca a conta Google de verdade:
  o login (o link do Google e o código colado, num terminal; o código errado; sair), o pedido restrito (a política de
  ferramentas no nível de administrador e a segunda trava no do usuário, GEMINI.md com as regras, o ambiente limpo, a
  sessão por id), a resposta montada dos pedaços, a proposta, o que ele tentou fora da trava (negado), os erros (cota,
  limite de passos), a troca Claude ↔ Gemini no meio da conversa, e o resumo de um contexto salvo pelo Gemini.
Por fim, a política gerada passa pelo leitor de políticas do Gemini CLI de verdade (sem login, numa pasta temporária)."""
import json, os, re, shutil, subprocess, tempfile, time, urllib.request
from pathlib import Path
B = "http://localhost:8768/pew/simu/"
PID = subprocess.run("ss -ltnp | grep ':8768 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("PEW_GEMINI_BIN", "").endswith("gemini_falso.py") and ENV.get("PEW_IA_TESTE") == "1", "suba o servidor de teste (reinicia_servidor_teste.sh)"
GEM = Path(ENV["PEW_GEMINI_DIR"])
assert GEM.resolve() != (Path.home() / ".gemini-pew").resolve(), "a instância de teste nunca usa o ~/.gemini-pew"
CONF = Path(ENV["PEW_CLAUDE_DIR"])
SALVOS, CASA, CTX = Path(ENV["PEW_SIMU_SALVOS"]), Path(ENV["PEW_SIMU_CACHE"]) / "claude", Path(ENV["PEW_CONTEXTOS"])


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-PEW": "1"})
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
    f = GEM / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []
def ultima():
    cs = [c for c in chamadas() if "-p" in c["args"] and "stream-json" in c["args"]]
    return cs[-1] if cs else {"args": [], "cwd": "", "env": [], "politica": "", "politica_base": "", "gemini_md": None}
def cenario(c, pasta=GEM):
    (pasta / "falso_cenario").write_text(c)
def pede(texto, ia="gemini", **extra):
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.01, "ia": ia, **extra})
    return r if "ERRO" in r else espera()
def vivos_falsos():
    """Os processos do gemini de mentira (um argumento do comando é o gemini_falso.py; um shell com o nome no texto não conta)."""
    out = []
    for d in Path("/proc").iterdir():
        try:
            if d.name.isdigit() and any(x.endswith(b"gemini_falso.py") for x in (d / "cmdline").read_bytes().split(b"\0")):
                out.append(d.name)
        except OSError:
            pass
    return out
def gemini():
    return next((a for a in api("claude/ias") if a["id"] == "gemini"), {})


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
shutil.rmtree(GEM, ignore_errors=True)
GEM.mkdir(parents=True)
CONF.mkdir(parents=True, exist_ok=True)
(CONF / "falso_logado").write_text("")
ids = []
try:
    # ---------------------------------------------------------------- a lista e o login
    g = gemini()
    ok(g.get("tem_login") and g.get("instalado") and g.get("modelos") == ["", "pro", "flash", "flash-lite"] and not g["estado"]["logado"]
       and g["estado"]["pasta"].endswith("gemini-pew"), f"/claude/ias: o Gemini, com login pelo PEW, deslogado (pasta {g.get('estado', {}).get('pasta')})")
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    r = pede("um pedido sem login")
    ok(r.get("ERRO") == 409 and "entre com a conta do Gemini" in r.get("erro", ""), f"pedido ao Gemini sem login: recusado ({r.get('erro')})")
    e = api("claude/ia/entrar", {"ia": "gemini"})
    l = e.get("login") or {}
    ok(l.get("andamento") and str(l.get("url", "")).startswith("https://accounts.google.com/o/oauth2/v2/auth?") and "codeassist.google.com%2Fauthcode" in l["url"],
       f"entrar: o link do Google aparece ({str(l.get('url'))[:60]}…)")
    lg = [c for c in chamadas() if "-p" not in c["args"]]
    ok(lg and lg[-1]["tty"] and lg[-1]["no_browser"] == "true" and lg[-1]["args"] == ["--skip-trust"],
       "o login é o gemini interativo num terminal, com NO_BROWSER (o link em vez de abrir o navegador)")
    r = api("claude/ia/codigo", {"ia": "gemini", "codigo": "a b"})
    ok(r.get("ERRO") == 409 and "código inteiro" in r.get("erro", ""), f"código que não tem a forma: recusado antes de ir ao CLI ({r.get('erro')})")
    e = api("claude/ia/codigo", {"ia": "gemini", "codigo": "4/codigo-ruim-999"})
    ok(not e.get("logado") and "o Google recusou o código (invalid_grant)" in str((e.get("login") or {}).get("erro")) and not (e.get("login") or {}).get("andamento"),
       f"código errado: o erro do Google, legível ({(e.get('login') or {}).get('erro')}), e o login termina")
    api("claude/ia/entrar", {"ia": "gemini"})
    e = api("claude/ia/codigo", {"ia": "gemini", "codigo": " 4/codigo-bom-123 "})
    vivos = vivos_falsos()
    ok(e.get("logado") and e.get("email") == "teste@gmail.com" and (e.get("login") or {}).get("mensagem") == "login feito" and not vivos,
       f"código certo: conectado como {e.get('email')}; o CLI interativo foi fechado ({len(vivos)} vivos)")
    st = json.loads((GEM / ".gemini" / "settings.json").read_text())
    ok(st["security"]["auth"]["selectedType"] == "oauth-personal" and st["privacy"]["usageStatisticsEnabled"] is False
       and st["general"]["enableAutoUpdate"] is False, "a configuração na pasta do PEW: conta Google, sem estatísticas de uso, sem atualização sozinha")

    # ---------------------------------------------------------------- o pedido
    cenario("ganho")
    sid_conv = api("claude/contextos")["conversa"]
    e = pede("dobre o Kp e crie um K2", modelo="flash")
    c = ultima()
    a = c["args"]
    p = e.get("proposta") or {}
    par = {q["nome"]: q["valor"] for q in p.get("parametros", [])}
    ok(p.get("mudou") and par.get("K2") == 7.5 and "Gemini falso" in str(p.get("codigo")), f"proposta: K2 = {par.get('K2')}, controle.py mudado")
    ok(e.get("resposta") == "Dobrei o **Kp** e criei o parâmetro `K2` = 7,5 V/A.", f"a resposta montada dos pedaços: {e.get('resposta')!r}")
    ok(e.get("eventos", [])[:3] == ["lendo CONTEXTO.md", "escrevendo parametros.json", "editando controle.py"], f"o que ele fez: {e.get('eventos')}")
    h = e["conversa"]["historico"][-1]
    ok(h.get("ia") == "gemini" and h.get("modelo") == "gemini-falso-2.5" and e.get("gasto", {}).get("entrada") == 1200 and e["gasto"]["saida"] == 300
       and e["gasto"]["turnos"] == 4 and e["gasto"].get("custo_estimado") is None,      # 4 voltas do modelo: ler; escrever; editar; responder
       f"a resposta marcada \"gemini\", o modelo e o gasto ({e.get('gasto')})")
    sem_texto = [x for k, x in enumerate(a) if not (k > 0 and a[k - 1] in ("-p", "--session-id", "--resume", "--admin-policy"))]
    ok(sem_texto == ["-p", "--output-format", "stream-json", "--skip-trust", "--approval-mode", "default", "--admin-policy", "--model", "flash", "--session-id"],
       f"gemini com exatamente estas opções: {sem_texto}")
    sid_g = a[a.index("--session-id") + 1]
    sess = json.loads((CASA / "sessoes.json").read_text())
    ok(re.fullmatch(r"[0-9a-f-]{36}", sid_g) and sid_g != sid_conv and any(v.get("sessoes", {}).get("gemini") == sid_g for v in sess.values()),
       f"a sessão do Gemini é dele (guardada em sessoes.json: {sid_g[:8]}…)")
    pasta = Path(c["cwd"])
    ok(pasta == CASA / "conversas" / sid_conv and str(c["gemini_md"]).startswith("Você é a IA do PEW (Gemini)"),
       "na pasta da conversa, com as regras do PEW em GEMINI.md")
    pol, base = c["politica"], c["politica_base"]
    m = re.search(r"argsPattern = '([^']*)'", pol)
    ok('toolName = "*"\ndecision = "deny"\npriority = 1' in pol and 'toolName = ["read_file", "read_many_files", "list_directory", "glob", "grep_search"]' in pol
       and 'toolName = ["write_file", "replace"]' in pol and m and str(pasta).replace("/", "\\/").replace(".", "\\.") in m.group(1),
       "a política (administrador): nega tudo; libera ler, listar e procurar; escrever só com o argsPattern desta pasta")
    ok('toolName = "*"\ndecision = "deny"' in base and "argsPattern" not in base and "write_file" not in base,
       "a segunda trava (usuário, .gemini/policies/pew_base.toml): só leitura")
    vaza = [k for k in c["env"] if re.match(r"(ANTHROPIC|CLAUDE|GEMINI_API|GOOGLE|OPENAI|VERTEX)", k)]
    ok(not vaza and "GEMINI_CLI_HOME" in c["env"] and "NODE_OPTIONS" in c["env"],
       f"ambiente limpo: nenhuma chave de IA vaza ({vaza or 'nada'}), GEMINI_CLI_HOME na pasta do PEW, o prazo de conexão do Node (NODE_OPTIONS)")
    api("claude/descartar", {})

    # 2º pedido: retoma a sessão dele, sem CONVERSA.md (não houve troca)
    cenario("le_conversa")
    e = pede("dois")
    a = ultima()["args"]
    ok("--resume" in a and a[a.index("--resume") + 1] == sid_g and "--session-id" not in a and e.get("resposta") == "sem CONVERSA.md",
       f"o 2º pedido retoma a sessão do Gemini (--resume), sem CONVERSA.md ({e.get('resposta')!r})")

    # a troca: Claude (lê CONVERSA.md) e de volta ao Gemini (retoma a sessão dele e lê o que o Claude disse)
    cenario("le_conversa", CONF)
    e = pede("três", ia="claude")
    ok(e.get("resposta") == "li a conversa: 2 pedido(s)" and e["conversa"]["historico"][-1].get("ia") == "claude",
       f"Gemini → Claude: o Claude lê CONVERSA.md ({e.get('resposta')!r})")
    ok(not (pasta / "GEMINI.md").exists(), "com o Claude, a pasta não tem o GEMINI.md (é reescrita a cada pedido)")
    e = pede("quatro")
    a = ultima()["args"]
    ok("--resume" in a and a[a.index("--resume") + 1] == sid_g and e.get("resposta") == "li a conversa: 3 pedido(s)",
       f"Claude → Gemini: retoma a sessão DELE e lê CONVERSA.md ({e.get('resposta')!r})")

    # o que ele tenta fora da trava: negado pela política (o gemini de mentira obedece ao argsPattern, como o CLI)
    cenario("recusa")
    ctx_antes = (pasta / "CONTEXTO.md").read_text()
    e = pede("mexa em tudo")
    rec = [x for x in e.get("eventos", []) if x.startswith("recusado:")]
    ok(e.get("resposta") == "escritas que passaram: 0 de 4" and len(rec) == 4 and "o PEW não deixa" in rec[0] and len(e.get("negados") or []) == 4,
       f"escrever /etc/passwd, CONTEXTO.md, ../fora.py e sub/x.py: as 4 negadas ({e.get('resposta')!r}; {len(e.get('negados') or [])} na lista)")
    ok((pasta / "CONTEXTO.md").read_text() == ctx_antes and not (pasta.parent / "fora.py").exists() and not (pasta / "sub").exists(),
       "nada foi escrito fora da trava")

    # os erros
    cenario("cota")
    e = pede("um pedido sem cota")
    ok("exhausted your daily quota" in str(e.get("erro")) and not e.get("proposta"), f"a cota acabou: o erro do Gemini ({e.get('erro')})")
    cenario("limite")
    e = pede("um pedido longo")
    ok("o Gemini chegou ao limite de 100 passos" in str(e.get("erro")), f"o limite de passos ({e.get('erro')})")
    cenario("inelegivel")
    e = pede("um pedido de conta pessoal")
    ok("Antigravity" in str(e.get("erro")) and "o Google não atende esta conta pelo Gemini CLI" in str(e.get("erro")) and "processTicks" not in str(e.get("erro")),
       f"a recusa do Google a contas pessoais (21/10): explicada, não a linha da pilha ({str(e.get('erro'))[:70]}…)")

    # o resumo de um contexto salvo, pelo Gemini (JSON em várias linhas; a falha vem na saída de erro)
    cenario("ganho")
    r = api("claude/contexto/salvar", {"titulo": "pelo Gemini", "resumo": "nota", "resumo_ia": True, "ia": "gemini"})
    cid = r.get("id", ""); ids.append(cid)
    for _ in range(60):
        m = json.loads((CTX / cid / "meta.json").read_text()) if cid else {}
        if m.get("resumo_ia", {}).get("estado") != "gerando":
            break
        time.sleep(0.5)
    res = (CTX / cid / "resumo_ia.md").read_text() if cid and (CTX / cid / "resumo_ia.md").exists() else ""
    cr = [c for c in chamadas() if "Resuma a conversa do PEW guardada nesta pasta" in " ".join(c["args"])]
    ok(m.get("resumo_ia", {}).get("estado") == "pronto" and "Gemini leu conversa.md: 8 pedido(s)" in res and m.get("ia") == "gemini"
       and cr and cr[-1]["cwd"] == str(CTX / cid) and "argsPattern" not in cr[-1]["politica"] and "--output-format" in cr[-1]["args"]
       and cr[-1]["args"][cr[-1]["args"].index("--output-format") + 1] == "json",
       f"resumo pelo Gemini: pronto ({res.splitlines()[-1] if res else '?'}); só leitura, na pasta do contexto; o contexto marcado \"gemini\"")
    cenario("resumo_falha")
    api("claude/contexto/resumo_ia", {"id": cid, "ia": "gemini"})
    for _ in range(60):
        m = json.loads((CTX / cid / "meta.json").read_text())
        if m.get("resumo_ia", {}).get("estado") != "gerando":
            break
        time.sleep(0.5)
    ok(m.get("resumo_ia", {}).get("estado") == "falhou" and "exhausted your daily quota" in str(m["resumo_ia"].get("erro")),
       f"o resumo falhou: a mensagem do Gemini, da saída de erro ({m.get('resumo_ia', {}).get('erro')})")

    # sair
    e = api("claude/ia/sair", {"ia": "gemini"})
    ok(not e.get("logado") and not (GEM / ".gemini" / "oauth_creds.json").exists() and not (GEM / ".gemini" / "google_accounts.json").exists(),
       "sair: os arquivos do login saem da pasta do PEW (o mesmo que o logout do CLI)")
    r = pede("depois de sair")
    ok(r.get("ERRO") == 409 and "entre com a conta do Gemini" in r.get("erro", ""), "depois de sair, o pedido ao Gemini é recusado")
    r = api("claude/ia/entrar", {"ia": "claude"})
    ok(r.get("ERRO") == 409, f"as rotas de conta são só das IAs com login pelo PEW ({r.get('erro')})")

    # a política gerada no leitor do Gemini CLI de verdade (numa pasta temporária, sem login: só carrega e lista)
    real = shutil.which("gemini") or next(iter(sorted((Path.home() / ".nvm" / "versions" / "node").glob("*/bin/gemini"))), None)
    if real:
        tmp = Path(tempfile.mkdtemp(prefix="pew-gemini-pol-"))
        try:
            (tmp / ".gemini" / "policies").mkdir(parents=True)
            (tmp / ".gemini" / "settings.json").write_text((GEM / ".gemini" / "settings.json").read_text())
            (tmp / ".gemini" / "policies" / "pew_base.toml").write_text(base)
            (tmp / "pol.toml").write_text(pol)
            (tmp / "conv").mkdir()
            env = {"PATH": f"{Path(real).parent}:/usr/bin:/bin", "HOME": str(Path.home()), "GEMINI_CLI_HOME": str(tmp), "NO_COLOR": "1", "TERM": "dumb"}
            r = subprocess.run([str(real), "--skip-trust", "--admin-policy", str(tmp / "pol.toml"), "--list-sessions"], cwd=tmp / "conv",
                               env=env, capture_output=True, text=True, timeout=90, stdin=subprocess.DEVNULL)
            saida = r.stdout + r.stderr
            ruim = tmp / "ruim.toml"
            ruim.write_text(pol.replace("priority = 100", 'priority = "x"'))
            r2 = subprocess.run([str(real), "--skip-trust", "--admin-policy", str(ruim), "--list-sessions"], cwd=tmp / "conv",
                                env=env, capture_output=True, text=True, timeout=90, stdin=subprocess.DEVNULL)
            ok("Policy file error" not in saida and "No previous sessions" in saida and "Policy file error" in r2.stdout + r2.stderr,
               "a política gerada passa pelo leitor do Gemini CLI de verdade (e uma estragada ele acusa: o teste enxerga)")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    else:
        print("(sem o gemini de verdade instalado: a leitura da política pelo CLI ficou de fora)")
finally:
    for f in ("falso_logado", "falso_cenario"):
        (CONF / f).unlink(missing_ok=True)
    (GEM / "falso_cenario").unlink(missing_ok=True)
    for cid in ids:
        if cid:
            api("claude/contexto/apagar", {"id": cid})
    api("claude/descartar", {}); api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
