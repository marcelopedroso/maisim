"""A peça do Cursor (ia/cursor.py) sem servidor e sem o `agent`: a leitura do stream-json (a sequência de exemplo da
documentação, cursor.com/docs/cli/reference/output-format, e os tipos de ferramenta do CLI 2026.10.22), a lista do
`agent models`, os erros conhecidos, a ordem das entradas (MAISIM_CURSOR_ENTRADA), o ambiente isolado (Linux e Windows: a
casa, as variáveis do Cursor, a chave só quando vale), o `agent` do Windows (o node.exe e o index.js da versão mais nova,
nunca o agent.cmd), a política (os caminhos absolutos; no Windows, com \\), a recusa de uma casa que não é só do MaiSim e
o pedido que começa com "-"."""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
for _p in (AQUI.parents[1] / "config", AQUI.parent):
    sys.path.insert(0, str(_p))
from ia import cursor as C  # noqa: E402

falhas = 0


def ok(c, txt):
    global falhas
    print(("OK   " if c else "FALHA") + " " + txt)
    falhas += (not c)


for k in ("MAISIM_CURSOR_BIN", "MAISIM_CURSOR_ENTRADA", "CURSOR_API_KEY"):
    os.environ.pop(k, None)
T = Path(tempfile.mkdtemp(prefix="cursor-offline-"))
casa = T / "casa"
a = C.Cursor(str(T / "nao-existe" / "cursor-agent"), casa)

# ---- a sequência de exemplo da documentação (output-format), linha a linha
DOC = r'''{"type":"system","subtype":"init","apiKeySource":"login","cwd":"/Users/user/project","session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff","model":"Claude 4 Sonnet","permissionMode":"default"}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Read README.md and create a summary"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll read the README.md file"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"started","call_id":"toolu_vrtx_01NnjaR886UcE8whekg2MGJd","tool_call":{"readToolCall":{"args":{"path":"README.md"}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"completed","call_id":"toolu_vrtx_01NnjaR886UcE8whekg2MGJd","tool_call":{"readToolCall":{"args":{"path":"README.md"},"result":{"success":{"content":"# Project\n\nThis is a sample project...","isEmpty":false,"exceededLimit":false,"totalLines":54,"totalChars":1254}}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Based on the README, I'll create a summary"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"started","call_id":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv","tool_call":{"writeToolCall":{"args":{"path":"summary.txt","fileText":"# README Summary\n\nThis project contains...","toolCallId":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv"}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"completed","call_id":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv","tool_call":{"writeToolCall":{"args":{"path":"summary.txt","fileText":"# README Summary\n\nThis project contains...","toolCallId":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv"},"result":{"success":{"path":"/Users/user/project/summary.txt","linesCreated":19,"fileSize":942}}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done! I've created the summary in summary.txt"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"result","subtype":"success","duration_ms":5234,"duration_api_ms":5234,"is_error":false,"result":"I'll read the README.md fileBased on the README, I'll create a summaryDone! I've created the summary in summary.txt","session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff","request_id":"10e11780-df2f-45dc-a1ff-4540af32e9c0"}'''
st, evs = {}, []
for linha in DOC.splitlines():
    evs += a.traduz(json.loads(linha), st)
tipos = [e["tipo"] for e in evs]
ok(tipos == ["inicio", "texto", "ferramenta", "texto", "ferramenta", "texto", "resultado"], f"a sequência da documentação: {tipos}")
ok(evs[0]["modelo"] == "Claude 4 Sonnet" and [e["nome"] for e in evs if e["tipo"] == "ferramenta"] == ["Read", "Write"]
   and evs[2]["entrada"]["file_path"] == "README.md", "o modelo do init e as ferramentas (readToolCall → Read, writeToolCall → Write)")
r = evs[-1]
ok(r["sessao"] == "c6b62c6f-7ead-4fd6-9922-e952131177ff" and r["ms"] == 5234 and not r["erro"] and r["turnos"] == 2 and r["modelo"] == "Claude 4 Sonnet"
   and r["uso"] == {"entrada": 0, "saida": 0}, f"o resultado: a sessão do agent, o tempo, sem erro ({r['sessao'][:8]}…)")
r = a.traduz({"type": "result", "subtype": "success", "is_error": False, "result": "x", "session_id": "s1234567",
              "usage": {"inputTokens": 100, "outputTokens": 20, "cacheReadTokens": 50, "cacheWriteTokens": 5}})[0]
ok(r["uso"] == {"entrada": 155, "saida": 20}, f"o gasto (usage do result: entrada + cache): {r['uso']}")
ok(a.le_resultado_json({"type": "result", "subtype": "success", "is_error": False, "result": "## Resumo", "session_id": "s"})["texto"] == "## Resumo"
   and a.le_resultado_json({}) is None, "o JSON de saída única (o resumo)")

# ---- os tipos de ferramenta do CLI e as recusas
st = {}
def um(tipo, args, res=None, sub="started"):
    corpo = {"args": args, **({"result": res} if res is not None else {})}
    return a.traduz({"type": "tool_call", "subtype": sub, "call_id": "c", "tool_call": {tipo: corpo}}, st)
nomes = [um(t, x)[0]["nome"] for t, x in (("editToolCall", {"path": "controle.py"}), ("globToolCall", {"globPattern": "*.py"}),
                                         ("grepToolCall", {"pattern": "Kp"}), ("lsToolCall", {"path": "."}), ("shellToolCall", {"command": "ls"}),
                                         ("deleteToolCall", {"path": "x.py"}), ("webFetchToolCall", {"url": "https://x"}), ("mcpToolCall", {}))]
ok(nomes == ["Edit", "Glob", "Grep", "Glob", "terminal (negado)", "apagar um arquivo", "web", "mcp"], f"os tipos do CLI → os nomes da tela: {nomes}")
ok(um("grepToolCall", {"pattern": "Kp"})[0]["entrada"]["pattern"] == "Kp" and um("globToolCall", {"globPattern": "*.py"})[0]["entrada"]["pattern"] == "*.py",
   "o padrão de uma busca vai para a tela")
rec = um("shellToolCall", {"command": "rm -rf x"}, {"rejected": {"command": "rm -rf x", "reason": "Denied by permissions configuration"}}, "completed")
rec2 = um("editToolCall", {"path": "/etc/x"}, {"writePermissionDenied": {"path": "/etc/x"}}, "completed")
ok(rec and rec[0]["tipo"] == "recusa" and "Denied by permissions configuration" in rec[0]["msg"] and rec2 and rec2[0]["tipo"] == "recusa"
   and not um("editToolCall", {"path": "a.py"}, {"success": {"path": "a.py"}}, "completed") and len(st["negados"]) == 2,
   "rejected e *PermissionDenied viram recusa (e vão para os negados); success, não")

# ---- a lista do `agent models` e os erros
lista = C.Cursor.le_modelos("\x1b[2mAvailable models\x1b[0m\n\nauto - Auto (current, default)\ngpt-5 - GPT-5\n"
                            "claude-opus-4-8[effort=high] - Claude Opus 4.8 (default)\n\nTip: use --model <id> (or /model <id> in interactive mode) to switch.\n")
ok(lista == [["auto", "Auto"], ["gpt-5", "GPT-5"], ["claude-opus-4-8[effort=high]", "Claude Opus 4.8"]], f"agent models: {lista}")
ok("pediu para entrar de novo" in a.erro_conhecido("Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable."),
   "sem login: pede para entrar")
ok("limite de uso" in a.erro_conhecido("Error: You've hit your usage limit") and a.erro_conhecido("Error: something else") is None
   and "confiar na pasta" in a.erro_conhecido("⚠ Workspace Trust Required"), "o limite e a confiança na pasta; um erro qualquer fica com a linha dele")

# ---- a ordem das entradas e a chave
ok(a.ordem() == ("login", "chave") and a.modo_login == "", "a ordem padrão: o login, depois a chave")
os.environ["MAISIM_CURSOR_ENTRADA"] = "chave,login"
ok(a.ordem() == ("chave", "login") and a.modo_login == "chave", "MAISIM_CURSOR_ENTRADA=chave,login: a chave primeiro")
os.environ["MAISIM_CURSOR_ENTRADA"] = "lixo"
ok(a.ordem() == ("login", "chave"), "um valor estranho: a ordem padrão")
a._confere_casa()
a.guarda_chave("crsr_offline_0123456789abcdefABCD")
a._token().parent.mkdir(parents=True, exist_ok=True)
a._token().write_text("x")
env = a.ambiente()
ok("CURSOR_API_KEY" not in env and a.estado()["modo"] == "login", "com o login e a chave, na ordem padrão: vale o login (a chave fica fora do ambiente)")
os.environ["MAISIM_CURSOR_ENTRADA"] = "chave,login"
env = a.ambiente()
ok(env.get("CURSOR_API_KEY") == "crsr_offline_0123456789abcdefABCD" and a.estado()["modo"] == "chave" and a.estado()["chave"] == "••••••••••ABCD",
   "com chave,login: vale a chave (só no ambiente do agent; a tela vê os 4 últimos)")
os.environ.pop("MAISIM_CURSOR_ENTRADA")
a._token().unlink()
ok(a.ambiente().get("CURSOR_API_KEY"), "sem o login, a chave vale mesmo na ordem padrão")
ok(env["HOME"] == str(casa.resolve()) and env["CURSOR_CONFIG_DIR"] == env["CURSOR_DATA_DIR"] == str(casa.resolve() / ".cursor")
   and env["XDG_CONFIG_HOME"] == str(casa.resolve() / ".config") and env["NO_OPEN_BROWSER"] == "1" and "CURSOR_API_ENDPOINT" not in env,
   "Linux: a casa é a HOME, a configuração e os dados do Cursor nela, nunca abre o navegador, sem outro endpoint")

# ---- o Windows: a casa (USERPROFILE/APPDATA) e o node.exe + index.js da versão mais nova
raiz = T / "Local" / "cursor-agent"
for v in ("2026.10.1-aaaa111", "2026.10.22-27dcf5f", "2026.9.30-bbbb222", "2026.10.22.new"):
    (raiz / "versions" / v).mkdir(parents=True)
    for f in ("node.exe", "index.js"):
        (raiz / "versions" / v / f).write_text("")
(raiz / "cursor-agent.cmd").write_text("")
w = C.Cursor(str(raiz / "cursor-agent.cmd"), T / "win-casa")
C.WIN = True
try:
    argv = w.argv()
    envw = w.ambiente()
    pw = w.politica(r"C:\Users\x\conversa", ("controle.py",))
finally:
    C.WIN = os.name == "nt"
ok(argv == [str(raiz / "versions" / "2026.10.22-27dcf5f" / "node.exe"), str(raiz / "versions" / "2026.10.22-27dcf5f" / "index.js")],
   f"Windows: o node.exe e o index.js da versão mais nova direto (nunca o agent.cmd): {[Path(x).parent.name for x in argv]}")
ok(envw["USERPROFILE"] == str((T / "win-casa").resolve()) and envw["APPDATA"].endswith("AppData/Roaming") and "HOMEPATH" not in envw,
   "Windows: USERPROFILE, APPDATA e LOCALAPPDATA na casa do MaiSim")
ok(any(x.endswith("\\controle.py)") for x in pw["allow"]) and any(x.endswith("\\*\\*)") for x in pw["deny"]), "Windows: as regras com \\")
vazio = C.Cursor(str(T / "vazio" / "cursor-agent.cmd"), T / "c2")
C.WIN = True
try:
    vazio.argv()
    ok(False, "Windows sem nenhuma versão: deveria recusar")
except ValueError as e:
    ok("nenhuma versão" in str(e), f"Windows sem nenhuma versão: recusa ({e})")
finally:
    C.WIN = os.name == "nt"

# ---- as travas
for ruim in (Path.home(), Path.home() / ".cursor"):
    try:
        C.Cursor("x", ruim)._confere_casa()
        ok(False, f"a casa {ruim}: deveria recusar")
    except ValueError as e:
        ok("pasta só do MaiSim" in str(e), f"a casa não pode ser {ruim} (recusa: o pedido não roda)")
conv = T / "conversa"
conv.mkdir()
cmd = a.comando("-v", "s", False, "regras", editaveis=("controle.py",), pasta=conv)
ok(cmd[-1] == " -v" and "--force" not in cmd and "-f" not in cmd and (conv / "AGENTS.md").read_text() == "regras"
   and json.loads((conv / ".cursor" / "cli.json").read_text())["permissions"] == a.politica(conv, ("controle.py",)),
   "um pedido que começa com \"-\" não vira opção; sem --force; as regras no AGENTS.md e a política na pasta")
try:
    a.comando("x", "s", False, "r")
    ok(False, "sem a pasta: deveria recusar")
except ValueError:
    ok(True, "sem a pasta de trabalho: recusa (não há onde pôr a política)")
cfg = json.loads((casa / ".cursor" / "cli-config.json").read_text())
ok(cfg["approvalMode"] == "allowlist" and cfg["sandbox"]["readBoundary"] == "workspace" and "Shell(ls)" not in json.dumps(cfg["permissions"]),
   "a configuração da casa: allowlist, leitura só na pasta, sem o Shell(ls) que o agent põe por padrão")
shutil.rmtree(T, ignore_errors=True)
raise SystemExit(1 if falhas else 0)
