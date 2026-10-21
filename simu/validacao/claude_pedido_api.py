"""O "pedir ao Claude" pela API, na instância de teste (7201), com o claude de mentira (validacao/claude_falso.py):
suba o servidor de teste com MAISIM_CLAUDE_BIN=<este diretório>/claude_falso.py e MAISIM_CLAUDE_DIR numa pasta descartável.
Confere o uso da conta, as opções com que o claude roda (restrito, só os três arquivos), a conversa (nova e retomada),
o contexto, a proposta (validada e testada, sem mexer no controle guardado), os erros, parar, anexos e a proteção das rotas."""
import base64, json, os, subprocess, time, urllib.request
from pathlib import Path

B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com MAISIM_CLAUDE_BIN=…/claude_falso.py"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
assert "maisim_teste" in str(CONF) or "/tmp/" in str(CONF), "MAISIM_CLAUDE_DIR tem de ser uma pasta descartável (reinicia_servidor_teste.sh)"
CASA = Path(ENV["MAISIM_SIMU_CACHE"]) / "claude"
CONF.mkdir(parents=True, exist_ok=True)


def api(rota, corpo=None, cab=None):
    h = {"Content-Type": "application/json", "X-MaiSim": "1", **(cab or {})}
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def cenario(c):
    (CONF / "falso_cenario").write_text(c)


def chamadas():
    f = CONF / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []


def ultimo_pedido():                                    # a última chamada de pedido (depois de cada uma o servidor lê o uso)
    return [c for c in chamadas() if "stream-json" in c["args"]][-1]


def espera():
    for _ in range(120):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.5)
    return e


def pede(texto, c):
    cenario(c)
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.01})
    return r if "ERRO" in r else espera()


import shutil, sys, datetime
SALVOS = Path(ENV["MAISIM_SALVOS"])
REPO = Path(__file__).resolve().parent / "dados"           # o exemplo original, congelado (o do repositório é do Marcelo e muda)
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):   # o exemplo na pasta de teste (desce_teste.sh a apaga)
    shutil.copy(REPO / f, SALVOS / f)
(CONF / "falso_logado").write_text("")
(CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
ex = SALVOS / "exemplo_controle_pwm.ipes"


def limpa():                                             # o que o teste pôs na pasta descartável e na instância de teste
    for f in ("falso_logado", "falso_cenario", "rodou.txt"):
        (CONF / f).unlink(missing_ok=True)
    api("claude/memoria", {"texto": ""})
    api("claude/nova", {})
    api("editor/abrir", {"arq": str(ex), "modo": "descartar"})


def principal():
    global sid
    r = api("editor/abrir", {"arq": str(ex), "modo": "descartar"})
    ok("ERRO" not in r, f"exemplo do buck aberto na edição ({r.get('erro', 'ok')})")
    guardado = api("editor/controle")["controle"]
    api("claude/nova", {})

    # uso da conta
    u = api("claude/uso?forca=1")
    semana = datetime.date.today() + datetime.timedelta(days=7)
    ok([i["rotulo"] for i in u.get("itens", [])] == ["sessão (5 h)", "semana", "semana · Fable"] and u["itens"][0]["pct"] == 42.0
       and u["itens"][0]["renova"] == "hoje às 13h50" and u["itens"][1]["renova"] == f"{semana.day:02d}/{semana.month:02d} às 12h00",
       f"uso: {[(i['rotulo'], i['pct'], i['renova']) for i in u.get('itens', [])]}")
    ok(any(c["args"][:2] == ["-p", "/usage"] and "--no-session-persistence" in c["args"] for c in chamadas()), "uso por `claude -p /usage`, sem gravar sessão")

    # 1º pedido: conversa nova, restrita
    e = pede("dobre o Kp e crie um K2", "ganho")
    p = e.get("proposta") or {}
    par = {q["nome"]: q["valor"] for q in p.get("parametros", [])}
    ok(p.get("mudou") and par.get("Kp") == 3.77 and par.get("K2") == 7.5, f"proposta: Kp 1,885 → {par.get('Kp')}, K2 = {par.get('K2')}")
    ok(not p.get("erros") and not p.get("conferencia") and "teste" not in p, f"proposta validada sem executar (conferência {p.get('conferencia')}; o teste só a pedido)")
    t = api("claude/testar", {"dt": 1e-6}).get("proposta", {}).get("teste") or {}
    ok(t.get("ok") and t["passos"][0]["a"] == {"g": 0.0}, f"▷ testar a pedido: ok, devolve {t.get('passos', [{}])[0].get('a')}")
    ok(e.get("resposta", "").startswith("Dobrei") and e.get("gasto", {}).get("saida") == 456 and e["gasto"]["entrada"] == 12120, f"resposta e gasto ({e.get('gasto')})")
    ok(e.get("eventos", [])[:3] == ["lendo CONTEXTO.md", "editando parametros.json", "editando controle.py"], f"o que ele fez: {e.get('eventos')}")
    ok(api("editor/controle")["controle"] == guardado, "o controle guardado não muda (a proposta só vale ao aplicar)")
    a = ultimo_pedido()["args"]
    sid = a[a.index("--session-id") + 1]
    tools = a[a.index("--tools") + 1]
    perm = a[a.index("--allowedTools") + 1: a.index("--permission-mode")]
    sem_texto = [x for k, x in enumerate(a) if not (k > 0 and a[k - 1] in ("-p", "--append-system-prompt", "--session-id", "--resume"))]
    esperado = ["-p", "--output-format", "stream-json", "--verbose", "--restricted", "--tools", "Read,Edit,Write,Glob,Grep", "--allowedTools",
                "Edit(./controle.py)", "Edit(./parametros.json)", "Edit(./acionamentos.json)", "Edit(./controladores.json)", "Edit(./memoria.md)",
                "Edit(./*.py)", "Write(./*.py)", "--permission-mode", "dontAsk",          # etapa B (19/10): os módulos (.py da pasta), nada fora dela
                "--permission-prompts", "none", "--strict-mcp-config", "--max-turns", "100", "--append-system-prompt", "--session-id"]
    ok(sem_texto == esperado, f"claude restrito, exatamente estas opções (nada a mais): ferramentas {tools}, edita só {perm}, dontAsk, sem perguntas, sem MCP")
    cwd = Path(ultimo_pedido()["cwd"])
    ok(cwd == CASA / "conversas" / sid, f"a pasta da conversa é o cwd ({cwd.name})")
    ctx = (cwd / "CONTEXTO.md").read_text()
    for trecho in ('m["i_L"]`: corrente no componente L.1', 'm["v_o"]`: tensão entre os nós o (+) e gnd (−)', '"g"` (bloco CONST.1): comanda a chave S.1',
                   "L.1 (Inductor L [H]): nós sw, o; inductance = 0.001", "tfim = 0.01 s", 'p["Kp"]` = 1.885 V/A', "def passo(t, m, p, e):"):
        ok(trecho in ctx, f"CONTEXTO.md tem: {trecho}")
    ok((cwd / "GUIA_CONTROLE.md").exists() and json.loads((cwd / "parametros.json").read_text())[0]["nome"] == "fsw", "a pasta tem o guia e os arquivos do controle")

    # 2º pedido: retoma a mesma conversa; metade do tempo com outro ganho (acionamento)
    e = pede("metade do tempo com Kp e depois 9", "metade")
    a = ultimo_pedido()["args"]
    ok("--resume" in a and a[a.index("--resume") + 1] == sid and "--session-id" not in a, "o 2º pedido retoma a mesma conversa (--resume)")
    acs = (e.get("proposta") or {}).get("acionamentos", [])
    ok({"t": 0.005, "alvo": "p:Kp", "valor": 9.0} in acs, f"acionamento na metade do tempo: {acs}")
    ok(len(e["conversa"]["historico"]) == 2 and e["conversa"]["historico"][0]["pedido"] == "dobre o Kp e crie um K2", "a conversa guarda os dois pedidos")

    # o modelo e o esforço escolhidos na tela (19/10): vão ao claude como --model e --effort; fora da lista, recusado
    cenario("ganho")
    r = api("claude/pedir", {"texto": "um pedido com sonnet e pouco esforço", "dt": 1e-6, "tfim": 0.01, "modelo": "sonnet", "esforco": "low"})
    e = r if "ERRO" in r else espera()
    a = ultimo_pedido()["args"]
    ok("--model" in a and a[a.index("--model") + 1] == "sonnet" and "--effort" in a and a[a.index("--effort") + 1] == "low",
       f"modelo e esforço: --model {a[a.index('--model') + 1] if '--model' in a else '?'} --effort {a[a.index('--effort') + 1] if '--effort' in a else '?'}")
    h = e.get("conversa", {}).get("historico", [])
    ok(h and h[-1].get("modelo") == "claude-falso", f"o histórico guarda o modelo que respondeu ({h[-1].get('modelo') if h else '?'})")
    r = api("claude/pedir", {"texto": "x", "dt": 1e-6, "tfim": 0.01, "modelo": "gpt", "esforco": ""})
    ok(r.get("ERRO") == 409 and "modelo" in r.get("erro", ""), f"modelo fora da lista: recusado ({r.get('erro', '')[:60]})")
    api("claude/descartar", {})

    # erros
    (CONF / "rodou.txt").unlink(missing_ok=True)
    e = pede("ponha uma linha no começo", "perigo")
    ok((e.get("proposta") or {}).get("mudou") and not (CONF / "rodou.txt").exists(), "o código proposto NÃO roda sozinho (a marca que ele deixaria ao executar não apareceu)")
    api("claude/testar", {"dt": 1e-6})
    ok((CONF / "rodou.txt").exists(), "e roda só quando o usuário pede o teste (a marca apareceu)")
    (CONF / "rodou.txt").unlink(missing_ok=True)
    e = pede("quebre o código", "quebra")
    p = e.get("proposta") or {}
    ok(p.get("erros") and "teste" not in p, f"código com erro de sintaxe: acusado ({(p.get('erros') or [{}])[0].get('msg')}), sem teste")
    e = pede("estrague os parâmetros", "json_ruim")
    ok("arquivo inválido" in ((e.get("proposta") or {}).get("erro") or ""), f"parametros.json inválido: {(e.get('proposta') or {}).get('erro')}")
    e = pede("qualquer coisa", "erro")
    ok("529" in (e.get("erro") or "") and e.get("proposta") is None, f"erro da API: {e.get('erro')}")
    e = pede("qualquer coisa", "execucao")
    ok("tool crashed" in (e.get("erro") or ""), f"erro de execução (motivo em errors): {e.get('erro')}")
    e = pede("edite /etc/passwd", "recusa")
    ok(e.get("negados") and any(x.startswith("recusado") for x in e.get("eventos", [])), f"fora da pasta: recusado ({e.get('negados')})")

    # parar
    cenario("lento")
    api("claude/pedir", {"texto": "devagar", "dt": 1e-6, "tfim": 0.01})
    time.sleep(1.5)
    ok(api("claude/pedido").get("andamento"), "pedido lento em andamento")
    ok(api("claude/pedir", {"texto": "outro", "dt": 1e-6, "tfim": 0.01}).get("ERRO") == 409, "um pedido por vez")
    e = api("claude/parar", {})
    time.sleep(1.5)
    vivos = []                                               # processos cujo script é o claude_falso.py (não shells que o citam)
    for d in Path("/proc").iterdir():
        try:
            argv = (d / "cmdline").read_bytes().split(b"\0")
        except OSError:
            continue
        if len(argv) > 1 and argv[1].endswith(b"claude_falso.py"):
            vivos.append(d.name)
    ok(not e.get("andamento") and e.get("erro") == "parado" and not vivos, f"parar: o processo sai ({vivos or 'nenhum'})")

    # anexos
    pdf = b"%PDF-1.4\n% artigo de teste\n"
    e = api("claude/anexo", {"nome": "artigo controle.pdf", "dados": base64.b64encode(pdf).decode()})
    ok([x["nome"] for x in e["conversa"]["anexos"]] == ["artigo controle.pdf"], f"anexo guardado: {e['conversa']['anexos']}")
    ok(api("claude/anexo", {"nome": "virus.exe", "dados": "AAAA"}).get("ERRO") == 409, "anexo de tipo não aceito: recusado")
    nomes = [x["nome"] for x in api("claude/anexo", {"nome": "../../fora.pdf", "dados": base64.b64encode(pdf).decode()}).get("conversa", {}).get("anexos", [])]
    ok("fora.pdf" in nomes and not list(CASA.rglob("fora.pdf"))[1:] and all(f.parent.name == "anexos" for f in CASA.rglob("fora.pdf")),
       f"nome com ../: vira fora.pdf, dentro de anexos/ ({nomes})")
    api("claude/tira_anexo", {"nome": "fora.pdf"})
    e = pede("implemente o controle do artigo", "anexo")
    ok("artigo controle.pdf" in (e.get("resposta") or "") and "novos: artigo controle.pdf" in e["resposta"], f"o Claude vê o anexo, marcado como novo: {e.get('resposta')}")
    e = pede("de novo", "anexo")
    ok("novos: nenhum" in (e.get("resposta") or ""), "no pedido seguinte o anexo não é mais novo")
    e = api("claude/tira_anexo", {"nome": "artigo controle.pdf"})
    ok(e["conversa"]["anexos"] == [], "tirar o anexo")

    # a sessão sumiu da pasta do Claude (apagada à mão): o próximo pedido recomeça, sem travar
    for f in (CONF / "projects").glob(f"*/{sid}.jsonl"):
        f.unlink()
    e = pede("de novo", "ganho")
    a = ultimo_pedido()["args"]
    ok("--session-id" in a and a[a.index("--session-id") + 1] == sid and not e.get("erro"), "sessão apagada: recomeça com o mesmo id (--session-id), sem erro")

    # o 1º pedido de uma conversa parado no meio: o seguinte retoma a sessão já gravada (com --session-id o CLI recusaria)
    api("claude/nova", {})
    cenario("lento")
    api("claude/pedir", {"texto": "devagar", "dt": 1e-6, "tfim": 0.01})
    time.sleep(1.5)
    api("claude/parar", {})
    time.sleep(1)
    sid2 = ultimo_pedido()["args"][ultimo_pedido()["args"].index("--session-id") + 1]
    e = pede("agora sim", "ganho")
    a = ultimo_pedido()["args"]
    ok("--resume" in a and a[a.index("--resume") + 1] == sid2 and not e.get("erro") and (e.get("proposta") or {}).get("mudou"),
       f"1º pedido parado e um novo: retoma a sessão gravada, sem 'already in use' ({e.get('erro') or 'ok'})")

    # salvar como: a conversa segue o circuito; folha nova: conversa nova
    hist = len(api("claude/pedido")["conversa"]["historico"])
    r = api("editor/salvar", {"nome": "claude_conv_teste", "sobrescrever": True})
    e = api("claude/pedido")
    ok("ERRO" not in r and e["conversa"]["circuito"].endswith("claude_conv_teste.ipes") and len(e["conversa"]["historico"]) == hist and not e.get("outro_circuito"),
       f"salvar como: a conversa vai junto ({hist} mensagens, proposta não fica 'de outro circuito')")
    api("editor/novo", {"modo": "descartar"})
    e = api("claude/pedido")
    ok(e["conversa"]["circuito"] == "(sem arquivo)" and e["conversa"]["historico"] == [], "circuito novo: conversa nova")
    (SALVOS / "claude_conv_teste.ipes").unlink(missing_ok=True)
    for f in SALVOS.glob("claude_conv_teste.*"):
        f.unlink()
    api("editor/abrir", {"arq": str(ex), "modo": "descartar"})

    # conversa nova
    e = api("claude/nova", {})
    ok(e["conversa"]["historico"] == [] and not e["conversa"]["iniciada"], "nova conversa: começa vazia")
    pede("dobre o Kp", "ganho")
    a = ultimo_pedido()["args"]
    ok("--session-id" in a and a[a.index("--session-id") + 1] != sid, "nova conversa: outra sessão")

    # a memória do MaiSim: o Claude propõe, o usuário aplica, e ela vai nos pedidos seguintes (em qualquer conversa)
    api("claude/memoria", {"texto": ""})
    e = pede("lembre que prefiro anti-windup por clamping", "memoria")
    p = e.get("proposta") or {}
    ok(p.get("mudou") and p.get("memoria_antes") == "" and p.get("memoria") == "- prefiro anti-windup por clamping\n" and not p.get("ligar")
       and p.get("codigo") == p.get("codigo_antes"), "o Claude propõe uma linha na memória (só ela muda; não liga o controle)")
    ok(api("claude/memoria")["texto"] == "", "a memória só muda ao aplicar")
    api("claude/memoria", {"texto": p["memoria"]})
    ok(api("claude/memoria")["texto"] == p["memoria"], "aplicada: guardada")
    api("claude/nova", {})
    pede("dobre o Kp", "ganho")
    ok((Path(ultimo_pedido()["cwd"]) / "memoria.md").read_text() == p["memoria"], "numa conversa nova, o pedido leva a memória")
    ok(api("claude/memoria", {"texto": "x" * 20_001}).get("ERRO") == 409, "memória grande demais: recusada")

    # proteção das rotas
    ok(api("claude/pedir", {"texto": "x"}, cab={"X-MaiSim": ""}).get("ERRO") == 403, "POST sem o cabeçalho da página: 403")
    ok(api("claude/pedido", cab={"Origin": "http://localhost:9999"}).get("ERRO") == 403, "GET de outra origem: 403")
    ok(api("claude/uso", cab={"Host": "evil.example"}).get("ERRO") == 403, "Host de fora (DNS rebinding): 403")
    antes = api("editor/controle")["controle"]
    r = api("editor/controle", {"controle": dict(antes, codigo="import os\n")}, cab={"Origin": "http://evil.example", "X-MaiSim": ""})
    r2 = api("editor/controle/testar", {"dt": 1e-6}, cab={"Origin": "http://localhost:9999", "X-MaiSim": ""})
    ok(r.get("ERRO") == 403 and r2.get("ERRO") == 403 and api("editor/controle")["controle"]["codigo"] == antes["codigo"],
       "todo POST de outra origem: 403 (guardar e testar o controle não aceitam página de fora)")
    ok(api("editor/controle", {"controle": antes}, cab={"X-MaiSim": ""}).get("ERRO") is None, "sem Origin (scripts locais, como estes testes): passa")


try:
    principal()
except Exception as e:                                   # o script caiu: conta como falha (e limpa mesmo assim)
    import traceback
    traceback.print_exc()
    ok(False, f"o teste caiu: {e}")
finally:
    limpa()
print(f"falhas: {falhas}")
