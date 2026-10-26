#!/usr/bin/env python3
"""Um Cursor CLI (`agent`) de mentira para testar o Cursor como IA do MaiSim sem conta (MAISIM_CURSOR_BIN apontando para cá).
Imita o `agent` 2026.10.22-27dcf5f como ele foi conferido em 25/10 (o --help, o status deslogado, o login até o link, a
documentação de output-format e de permissions): os mesmos comandos, as mesmas mensagens de erro, o stream-json
(system/init, user, assistant, tool_call started/completed com readToolCall/editToolCall/shellToolCall…, result com usage)
e a MESMA política de permissões (o modo "allowlist" sem --force: negado > permitido; escrever na pasta de trabalho pode,
fora dela pede aprovação, que o modo sem janela nega; o terminal, só o que estiver permitido; os caminhos das regras
comparados com o caminho absoluto, * = qualquer coisa).

A casa é a HOME (a descartável da instância de teste, MAISIM_CURSOR_DIR). Arquivos de controle nela:
  falso_cenario    o pedido: ganho | le_conversa | terminal | fora | contexto | erro | limite | sem_login | lento | resumo_falha
  falso_login      o login pela página: ok (autorizou) | erro (a página recusou); sem ele, o login espera
  falso_chamadas.jsonl   cada chamada (argumentos, pasta, os NOMES das variáveis do ambiente, se havia chave — nunca a
                   chave —, a configuração e as regras da pasta), para o teste conferir
Uma chave de API "boa" começa com "crsr_bom_"; outra é recusada como a de verdade recusaria."""
import hashlib
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

for _p in (Path(__file__).resolve().parents[2] / "config", Path(__file__).resolve().parents[1]):   # os textos da IA (pt e en)
    if str(_p) not in sys.path:
        sys.path.append(str(_p))
import textos  # noqa: E402                    o pedido vem no idioma de quem pediu: o de mentira reconhece os dois
from contextos import PEDIDO_MD  # noqa: E402  "## N. Pedido" ou "## N. Request"

RESUMO = {textos.T[k][l] for k in ("ia.resumo_pedido", "ia.resumo_junta") for l in ("pt", "en")}
VERSAO = "2026.10.22-27dcf5f"
args = sys.argv[1:]
casa = Path(os.environ.get("HOME", "."))
conf_dir = Path(os.environ.get("CURSOR_CONFIG_DIR") or casa / ".cursor")
token = Path(os.environ.get("XDG_CONFIG_HOME") or casa / ".config") / "cursor" / "auth.json"
chave = os.environ.get("CURSOR_API_KEY") or ""
conf_arq = conf_dir / "cli-config.json"
try:
    conf = json.loads(conf_arq.read_text())
except (OSError, ValueError):
    conf = {}
proj_arq = Path.cwd() / ".cursor" / "cli.json"
try:
    proj = json.loads(proj_arq.read_text())
except (OSError, ValueError):
    proj = {}
casa.mkdir(parents=True, exist_ok=True)
with open(casa / "falso_chamadas.jsonl", "a") as f:
    f.write(json.dumps({"args": args, "cwd": os.getcwd(), "env": sorted(os.environ), "tem_chave": bool(chave), "home": str(casa),
                        "config_dir": str(conf_dir), "data_dir": os.environ.get("CURSOR_DATA_DIR"), "config": conf, "projeto": proj,
                        "agents_md": (Path.cwd() / "AGENTS.md").read_text() if (Path.cwd() / "AGENTS.md").exists() else None}) + "\n")
cenario = (casa / "falso_cenario").read_text().strip() if (casa / "falso_cenario").exists() else "ganho"
MODELOS = [("auto", "Auto"), ("gpt-falso", "GPT Falso"), ("claude-falso-thinking", "Claude Falso Thinking")]


def erro(msg, cod=1):
    print(msg, file=sys.stderr)
    sys.exit(cod)


def autenticado():
    if chave:
        return "env" if chave.startswith("crsr_bom_") else False
    return "login" if token.exists() else None


def sem_autenticacao(msg):
    a = autenticado()
    if a is False:                                       # a mensagem do `agent` de verdade com uma chave inválida (conferida)
        erro("\x1b[33m⚠ Warning: The provided API key is invalid.\x1b[0m\nThe API key was loaded from the CURSOR_API_KEY environment variable.\n"
             "Please check you have the right key, create a new one, or authenticate without it.\n")
    if a is None:
        erro(msg)
    return a


if args in (["--version"], ["-v"]):
    print(VERSAO)
    sys.exit(0)
if args[:1] in (["status"], ["whoami"]):
    if token.exists():
        st = {"status": "authenticated", "isAuthenticated": True, "hasAccessToken": True, "hasRefreshToken": True,
              "userInfo": {"email": "teste@cursor.local"}}
    else:
        st = {"status": "unauthenticated", "isAuthenticated": False, "hasAccessToken": False, "hasRefreshToken": False, "message": "Not logged in"}
    print(json.dumps(st, indent=2) if "--format" in args and args[args.index("--format") + 1] == "json" else
          ("✓ Logged in as teste@cursor.local" if token.exists() else "Not logged in"))
    sys.exit(0)
if args[:1] == ["models"] or "--list-models" in args:
    sem_autenticacao("Error: Authentication required. Run 'agent login', pass --api-key/--auth-token, or set CURSOR_API_KEY/CURSOR_AUTH_TOKEN.")
    print("Available models\n")
    for i, (m, n) in enumerate(MODELOS):
        print(f"{m} - {n}" + (" (current, default)" if i == 0 else ""))
    print("\nTip: use --model <id> (or /model <id> in interactive mode) to switch.")
    sys.exit(0)
if args[:1] == ["logout"]:
    token.unlink(missing_ok=True)
    print("Preparing to log out...\nLogged out successfully")
    sys.exit(0)
if args[:1] == ["login"]:                                 # como o `agent login` com NO_OPEN_BROWSER: o link, e espera a página
    if os.environ.get("NO_OPEN_BROWSER") != "1":
        erro("cursor_falso: o login abriria o navegador (sem NO_OPEN_BROWSER=1)", 5)
    print("Starting login process...\nAuthenticating with Cursor...\nWaiting for browser authentication...", flush=True)
    print("Open a browser and navigate to this link: https://cursor.com/loginDeepControl?challenge=falso&uuid=falso&mode=login"
          "&redirectTarget=cli&supportsSelectedTeamLogin=true", flush=True)
    while True:
        r = (casa / "falso_login").read_text().strip() if (casa / "falso_login").exists() else ""
        if r == "ok":
            token.parent.mkdir(parents=True, exist_ok=True)
            token.write_text("falso")
            print("✓ Logged in as teste@cursor.local", flush=True)
            sys.exit(0)
        if r == "erro":
            erro("Login failed: the authorization was denied")
        time.sleep(0.2)

# ---------------------------------------------------------------- o pedido (-p)
if "-p" not in args and "--print" not in args:
    erro("cursor_falso: só o modo sem janela (-p)", 2)
if any(x in args for x in ("--force", "-f", "--yolo")):
    erro("cursor_falso: --force (o MaiSim nunca roda o Cursor sem a política)", 3)
if conf_dir.resolve() != (casa / ".cursor").resolve() or os.environ.get("CURSOR_DATA_DIR") != str(conf_dir):
    erro("cursor_falso: a configuração não está na casa do MaiSim", 4)
if "--trust" not in args:
    erro("\n⚠ Workspace Trust Required\n\n  Cursor Agent can execute code and access files in this directory.\n"
         "  Do you trust the contents of this directory?\n\n    " + os.getcwd() + "\n\n  To proceed, you can either:\n"
         "    • Run 'agent' interactively to decide\n    • Pass --trust, --yolo, or -f if you trust this directory\n")
fonte = sem_autenticacao("Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.")
opc = {"--output-format", "--model", "--resume", "--workspace", "--sandbox", "--mode"}
prompt, i = None, 0
while i < len(args):
    if args[i] in opc:
        i += 2
        continue
    if not args[i].startswith("-"):
        prompt = args[i]
    i += 1
saida = args[args.index("--output-format") + 1] if "--output-format" in args else "text"
modelo = args[args.index("--model") + 1] if "--model" in args else "auto"
if modelo not in [m for m, _ in MODELOS]:
    erro(f"Cannot use this model: {modelo}. Available models: {', '.join(m for m, _ in MODELOS)}")
ws = Path(args[args.index("--workspace") + 1]).resolve() if "--workspace" in args else Path.cwd().resolve()
chats = conf_dir / "chats" / hashlib.md5(str(Path.cwd().resolve()).encode()).hexdigest()
if "--resume" in args:
    sid = args[args.index("--resume") + 1]
    if not (chats / sid / "store.db").exists():
        erro(f"Error: Chat {sid} not found")
else:
    sid = str(uuid.uuid4())
(chats / sid).mkdir(parents=True, exist_ok=True)
(chats / sid / "store.db").write_text("")

# ---- a política: a do `agent` (negado > permitido > modo; sem --force, o que pede aprovação é negado)
perm = {"allow": list((conf.get("permissions") or {}).get("allow") or []) + list((proj.get("permissions") or {}).get("allow") or []),
        "deny": list((conf.get("permissions") or {}).get("deny") or []) + list((proj.get("permissions") or {}).get("deny") or [])}
modo = "unrestricted" if conf.get("approvalMode") == "unrestricted" else "allowlist"


def casa_padrao(regra, tipo, alvo):
    m = re.fullmatch(rf"\s*{tipo}\s*\((.*)\)\s*", regra)
    if not m:
        return False
    p = m.group(1).strip()
    p = str(Path.home()) + p[1:] if p.startswith("~") else p      # o `agent` só troca o ~; o resto é comparado como está
    return re.match("^" + re.escape(p).replace(r"\*", ".*") + "$", alvo) is not None


def pode(tipo, alvo):
    """(True, None) ou (False, motivo), como o shouldBlockWrite/shouldBlockShellCommand do `agent` sem janela."""
    if tipo in ("Write", "Read"):
        alvo = str((Path.cwd() / alvo).resolve())
    if any(casa_padrao(r, tipo, alvo) for r in perm["deny"]):
        return False, "Denied by permissions configuration"
    if any(casa_padrao(r, tipo, alvo) for r in perm["allow"]):
        return True, None
    if modo == "unrestricted":
        return True, None
    if tipo == "Shell":
        return False, "Command not in allowlist"
    dentro = alvo == str(ws) or alvo.startswith(str(ws) + os.sep)
    if tipo == "Read":
        boundary = (conf.get("sandbox") or {}).get("readBoundary")
        return (True, None) if dentro or boundary != "workspace" else (False, "This reads a file outside your workspace.")
    if not dentro:
        return False, "Out of workspace"
    if "/.cursor/" in alvo + "/":
        return False, "Protected config file"
    return True, None


def sai(ev):
    print(json.dumps({**ev, "session_id": sid}, ensure_ascii=False), flush=True)


chamada = [0]
inicio = time.time()


def fala(texto):
    sai({"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": texto}]}})


def usa(tipo, args_, faz=None):
    """Uma ferramenta: started, a política, completed (success ou rejected)."""
    chamada[0] += 1
    cid = f"toolu_falso_{chamada[0]}"
    sai({"type": "tool_call", "subtype": "started", "call_id": cid, "tool_call": {tipo: {"args": args_}}})
    if tipo == "shellToolCall":
        ok, motivo = pode("Shell", args_["command"].split()[0])
    elif tipo in ("editToolCall", "writeToolCall", "deleteToolCall"):
        ok, motivo = pode("Write", args_["path"])
    else:
        ok, motivo = pode("Read", args_.get("path") or args_.get("targetDirectory") or ".")
    if ok:
        r = faz() if faz else {}
        res = {"success": {"path": str((Path.cwd() / args_.get("path", ".")).resolve()), **(r or {})}}
    else:
        alvo = args_.get("command") or args_.get("path")
        res = {"rejected": {"command" if tipo == "shellToolCall" else "path": alvo, "reason": motivo}}
    sai({"type": "tool_call", "subtype": "completed", "call_id": cid, "tool_call": {tipo: {"args": args_, "result": res}}})
    return ok


def escreve(arq, texto):
    def f():
        Path(arq).write_text(texto)
        return {"linesAdded": texto.count("\n") + 1}
    return f


uso = {"inputTokens": 1800, "outputTokens": 240, "cacheReadTokens": 1200, "cacheWriteTokens": 0}
modelo_nome = dict(MODELOS)[modelo]

# ---------------------------------------------------------------- o resumo de um contexto salvo (json, só leitura)
if prompt in RESUMO:
    if saida != "json" or args[args.index("--mode") + 1] != "ask":
        erro("cursor_falso: o resumo é em JSON e no modo ask", 6)
    if cenario == "resumo_falha":
        erro("Error: quota exceeded")
    conv = Path("conversa.md").read_text() if Path("conversa.md").exists() else ""
    n = len(PEDIDO_MD.findall(conv))
    texto = f"## Objetivo\nTeste.\n\n## O que foi feito\nCursor leu conversa.md: {n} pedido(s)."
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "duration_ms": 1500, "duration_api_ms": 1500,
                      "result": texto, "session_id": sid, "request_id": "falso"}))
    sys.exit(0)

if saida != "stream-json":
    erro("cursor_falso: o pedido do MaiSim é em stream-json", 6)
sai({"type": "system", "subtype": "init", "apiKeySource": fonte, "cwd": os.getcwd(), "model": modelo_nome, "permissionMode": "default"})
sai({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": prompt}]}})
if cenario == "sem_login":
    token.unlink(missing_ok=True)
    erro("Error: Your stored authentication is invalid. Please log in again.")
if cenario == "limite":
    erro("Error: You've hit your usage limit. Upgrade your plan or wait for the limit to reset.")
fala("Vou ler o CONTEXTO.md.")
usa("readToolCall", {"path": "CONTEXTO.md"})
if cenario == "lento":
    time.sleep(60)
resposta = "pronto"
if cenario == "ganho":
    pars = json.loads(Path("parametros.json").read_text())
    for q in pars:
        if q["nome"] == "Kp":
            q["valor"] = round(q["valor"] * 2, 6)
    pars.append({"nome": "K2", "valor": 7.5, "unidade": "V/A"})
    usa("editToolCall", {"path": "parametros.json"}, escreve("parametros.json", json.dumps(pars, indent=1)))
    cod = Path("controle.py").read_text().replace("def passo(t, m, p, e):", "def passo(t, m, p, e):\n    _k2 = p[\"K2\"]   # ganho extra (Cursor falso)", 1)
    usa("editToolCall", {"path": "controle.py"}, escreve("controle.py", cod))
    resposta = "Dobrei o **Kp** e criei o `K2`."
elif cenario == "le_conversa":
    regras = (Path("AGENTS.md").read_text() if Path("AGENTS.md").exists() else "")
    if "CONVERSA.md" in prompt and Path("CONVERSA.md").exists():
        usa("readToolCall", {"path": "CONVERSA.md"})
        resposta = f"li a conversa: {len(PEDIDO_MD.findall(Path('CONVERSA.md').read_text()))} pedido(s)"
    else:
        resposta = "sem CONVERSA.md"
    if any(textos.T["ia.voce_ia"][l].format(nome="Cursor") in regras for l in ("pt", "en")):
        resposta += " (com as regras do MaiSim)"
elif cenario == "terminal":                                  # o terminal: negado pela política, e ele segue
    ok = usa("shellToolCall", {"command": "python3 controle.py", "workingDirectory": os.getcwd()})
    resposta = "rodei o controle" if ok else "o terminal foi negado; segui só com os arquivos"
elif cenario == "fora":                                      # escrever fora da pasta e num arquivo só de leitura
    fora = str(Path.cwd().parent / "fora.txt")
    a = usa("editToolCall", {"path": fora}, escreve(fora, "x"))
    b = usa("editToolCall", {"path": "CONTEXTO.md"}, escreve("CONTEXTO.md", "mudado"))
    Path("anexos").mkdir(exist_ok=True)
    c = usa("editToolCall", {"path": "anexos/nota.txt"}, escreve("anexos/nota.txt", "x"))
    d = usa("readToolCall", {"path": str(casa / "maisim" / "chave")})
    resposta = f"fora={a} contexto={b} anexo={c} chave={d}"
elif cenario == "erro":
    erro("Error: [internal] The model returned an error. Try again.")
fala(resposta)
ms = int((time.time() - inicio) * 1000) + 3250
sai({"type": "result", "subtype": "success", "duration_ms": ms, "duration_api_ms": ms, "is_error": False, "result": resposta,
     "request_id": "falso", "usage": uso})
