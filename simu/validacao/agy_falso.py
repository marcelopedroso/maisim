#!/usr/bin/env python3
"""Um `agy` (Antigravity CLI) de mentira para testar o Google Antigravity como IA do MaiSim sem a conta Google (MAISIM_AGY_BIN
apontando para cá). Imita o agy 1.4.4 como ele se comportou com a conta do Marcelo em 21/10.

A casa é o HOME (a descartável da instância de teste). Arquivos de controle nela:
  falso_cenario    o pedido: ganho | le_conversa | terminal | fora | erro | lento | resumo_falha
  falso_login      auto: a página do Antigravity devolve o código sozinha (o agy entra sem colar nada)
  falso_conta      a conta que o agy escreve no log a cada vez que roda (padrão teste@gmail.com)
  falso_chamadas.jsonl   cada chamada (argumentos, pasta, as chaves do ambiente, a configuração), para o teste conferir
O login: o menu "Select login method" (Enter = Google OAuth), o link do Google, "paste the authorization code below:"; o
código "4/codigo-bom-123" grava o arquivo do login (.gemini/antigravity-cli/antigravity-oauth-token); outro dá invalid_grant.
O pedido (-p): stream-json aninhado ({"event": "step_update", "step_update": {...}}), e OBEDECE às regras do MaiSim: com
"command(*)" negado na configuração, o terminal volta negado e ele segue; sem a regra, para sem resposta (como o agy)."""
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

args = sys.argv[1:]
casa = Path(os.environ.get("HOME", "."))
agy = casa / ".gemini" / "antigravity-cli"
agy.mkdir(parents=True, exist_ok=True)
token = agy / "antigravity-oauth-token"
conf_arq = agy / "settings.json"
conf = json.loads(conf_arq.read_text()) if conf_arq.exists() else {}
with open(casa / "falso_chamadas.jsonl", "a") as f:
    f.write(json.dumps({"args": args, "cwd": os.getcwd(), "env": sorted(os.environ), "settings": conf, "tty": os.isatty(0)}) + "\n")
cenario = (casa / "falso_cenario").read_text().strip() if (casa / "falso_cenario").exists() else "ganho"
conta = (casa / "falso_conta").read_text().strip() if (casa / "falso_conta").exists() else "teste@gmail.com"


def registra_conta():
    """Como o agy 1.4.4: a cada vez que roda com o login, o log dele diz a conta."""
    log = agy / "log"
    log.mkdir(exist_ok=True)
    nome = time.strftime("cli-%Y%m%d_%H%M%S") + f"{time.time() % 1:.6f}"[1:].replace(".", "_") + ".log"
    (log / nome).write_text(f"I1021 12:16:35.069025       1 server_oauth.go:224] applyAuthResult: email={conta}, authMethod=consumer\n"
                            f"I1021 12:16:35.069029       1 server_oauth.go:229] OAuth: authenticated successfully as {conta}\n")


def dorme():
    while True:
        time.sleep(1)


if args[:1] == ["models"]:
    print("Fetching available models...")
    print("gemini-falso-high\tGemini Falso (High)")
    print("claude-falso-medium\tClaude Falso (Medium)")
    sys.exit(0)

# ---------------------------------------------------------------- o login (interativo, sem -p)
if "-p" not in args:
    if not os.isatty(0):
        print("Print mode: not logged in and no controlling terminal; cannot complete interactive login", file=sys.stderr)
        sys.exit(1)
    sys.stdout.write("Welcome to the Antigravity CLI. You are currently not signed in.\r\nSelect login method:\r\n> 1. Google OAuth\r\n"
                     "2. Use a Google Cloud project\r\n")
    sys.stdout.flush()
    sys.stdin.readline()                                     # o Enter do menu
    sys.stdout.write("Your browser should open automatically. If not:\r\nhttps://accounts.google.com/o/oauth2/auth?access_type=offline"
                     "&client_id=falso.apps.googleusercontent.com&code_challenge=falso&code_challenge_method=S256&prompt=consent"
                     "&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&state=falso\r\n"
                     "If you aren't automatically redirected, paste the authorization code below:\r\nauthorization code...\r\n")
    sys.stdout.flush()
    if (casa / "falso_login").exists() and (casa / "falso_login").read_text().strip() == "auto":
        time.sleep(1)
        token.write_text("falso")                             # a página devolveu o código: o agy entra sozinho
        time.sleep(0.5)
        registra_conta()                                      # (e não escreve "Successfully authenticated" no terminal)
        dorme()
    codigo = sys.stdin.readline().strip()
    if codigo == "4/codigo-bom-123":
        token.write_text("falso")
        registra_conta()
        sys.stdout.write(f"\r\nSuccessfully authenticated as {conta}.\r\n")
    else:
        sys.stdout.write('\r\nError: OAuth token exchange failed: oauth2: "invalid_grant" "Bad Request"\r\n')
    sys.stdout.flush()
    dorme()

prompt = args[args.index("-p") + 1]
saida = args[args.index("--output-format") + 1] if "--output-format" in args else "text"
if not token.exists():                                       # como o agy sem login, fora de um terminal
    print("Authentication required. Please visit the URL to log in:\n  https://accounts.google.com/o/oauth2/auth?falso\n\n"
          "error: authentication failed or timed out", file=sys.stderr)
    print(json.dumps({"event": "result", "result": {"conversation_id": "", "status": "ERROR", "response": "",
                      "error": "authentication failed or timed out", "duration_seconds": 0, "num_turns": 0}}))
    sys.exit(0)
registra_conta()
if prompt == "/usage":                                       # os limites (o comando do agy: 0 tokens), como o agy 1.4.4
    agora = time.time()
    iso = lambda dt: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(agora + dt))
    grupos = [{"name": "Gemini Models", "description": "Models within this group: Gemini Flash, Gemini Pro", "buckets": [
                  {"id": "gemini-weekly", "window": "weekly", "remaining_fraction": 0.75, "reset_time": iso(6 * 86400)},
                  {"id": "gemini-5h", "window": "5h", "remaining_fraction": 0.992, "reset_time": iso(3 * 3600)}]},
              {"name": "Claude and GPT models", "description": "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS", "buckets": [
                  {"id": "3p-weekly", "window": "weekly", "remaining_fraction": 1, "reset_time": iso(6 * 86400)}]}]
    print(json.dumps({"conversation_id": "", "status": "SUCCESS", "response": "…", "num_turns": 0,
                      "command": {"name": "usage", "data": {"groups": grupos}}}))
    sys.exit(0)
if "--sandbox" not in args or "--disable-slash-commands" not in args:
    print("agy_falso: sem --sandbox ou --disable-slash-commands", file=sys.stderr)
    sys.exit(3)
nega = (conf.get("permissions") or {}).get("deny") or []

conversas = agy / "conversations"
conversas.mkdir(exist_ok=True)
if "--conversation" in args:
    cid = args[args.index("--conversation") + 1]
    if not (conversas / f"{cid}.db").exists():
        print(f"error: conversation {cid} not found", file=sys.stderr)
        sys.exit(1)
else:
    cid = str(uuid.uuid4())
    (conversas / f"{cid}.db").write_text("")
uso = {"input_tokens": 2000, "output_tokens": 300, "thinking_tokens": 50, "cache_read_tokens": 1000, "total_tokens": 3350}

# ---------------------------------------------------------------- o resumo de um contexto salvo (-o json)
if "Resuma a conversa do MaiSim guardada nesta pasta" in prompt:
    assert saida == "json", "resumo: JSON"
    if cenario == "resumo_falha":
        print(json.dumps({"conversation_id": cid, "status": "ERROR", "response": "", "error": "quota exceeded"}, indent=2))
        sys.exit(1)
    conv = Path("conversa.md").read_text() if Path("conversa.md").exists() else ""
    n = len(re.findall(r"(?m)^## \d+\. Pedido", conv))
    print(json.dumps({"conversation_id": cid, "status": "SUCCESS", "response": f"## Objetivo\nTeste.\n\n## O que foi feito\nAntigravity leu conversa.md: {n} pedido(s).",
                      "duration_seconds": 1.5, "num_turns": 1, "usage": uso}, indent=2))
    sys.exit(0)

passo = [0]


def sai(ev, d):
    print(json.dumps({"event": ev, ev: d}, ensure_ascii=False), flush=True)


def fala(texto):
    passo[0] += 1
    for pedaco in re.findall(r".{1,12}", texto, re.S):
        sai("step_update", {"conversation_id": cid, "step_index": passo[0], "state": "ACTIVE", "step_type": "agent_response", "text_delta": pedaco})
    sai("step_update", {"conversation_id": cid, "step_index": passo[0], "state": "DONE", "step_type": "agent_response", "text_delta": "\n", "usage": uso})


def usa(nome, **par):
    passo[0] += 1
    info = {"name": nome, "parameters": par}
    sai("step_update", {"conversation_id": cid, "step_index": passo[0], "state": "ACTIVE", "step_type": "tool", "tool_name": nome, "tool_info": info})
    sai("step_update", {"conversation_id": cid, "step_index": passo[0], "state": "DONE", "step_type": "tool", "tool_name": nome, "tool_info": info})


def para(permissao):                                         # o agy sem janela: a permissão vira negada e ele para, sem resposta
    print(f'jetski: no output produced — a tool required the "{permissao}" permission that headless mode cannot prompt for, so it '
          f"was auto-denied. Add an allow-rule under permissions.allow in settings.json (e.g. {permissao}(<target>)).", file=sys.stderr)
    sai("result", {"conversation_id": cid, "status": "SUCCESS", "response": "", "duration_seconds": 2.0, "num_turns": 1, "usage": uso})
    sys.exit(0)


modelo = args[args.index("--model") + 1] if "--model" in args else None
sai("init", {"cwd": os.getcwd(), "tools": ["view_file", "write_to_file", "replace_file_content", "run_command"],
             "permission_mode": "request-review", **({"model": modelo} if modelo else {})})
passo[0] = 0
sai("step_update", {"conversation_id": cid, "step_index": 0, "state": "DONE", "step_type": "user_input"})
usa("view_file", AbsolutePath=str(Path.cwd() / "CONTEXTO.md"))
if cenario == "lento":
    time.sleep(60)
resposta = "pronto"
if cenario == "ganho":
    fala("Vou dobrar o Kp e criar o K2.")
    pars = json.loads(Path("parametros.json").read_text())
    for q in pars:
        if q["nome"] == "Kp":
            q["valor"] = round(q["valor"] * 2, 6)
    pars.append({"nome": "K2", "valor": 7.5, "unidade": "V/A"})
    usa("replace_file_content", TargetFile=str(Path.cwd() / "parametros.json"))
    Path("parametros.json").write_text(json.dumps(pars, indent=1))
    usa("write_to_file", TargetFile="controle.py")
    Path("controle.py").write_text(Path("controle.py").read_text().replace("def passo(t, m, p, e):", "def passo(t, m, p, e):\n    _k2 = p[\"K2\"]   # ganho extra (Antigravity falso)", 1))
    resposta = f"Dobrei o **Kp** e criei o `K2` em [parametros.json](file://{Path.cwd()}/parametros.json)."
elif cenario == "le_conversa":
    if "CONVERSA.md" in prompt and Path("CONVERSA.md").exists():
        usa("view_file", AbsolutePath="CONVERSA.md")
        n = len(re.findall(r"(?m)^## \d+\. Pedido", Path("CONVERSA.md").read_text()))
        resposta = f"li a conversa: {n} pedido(s)"
    else:
        resposta = "sem CONVERSA.md" + (" (com as regras do MaiSim)" if "Você é a IA do MaiSim" in prompt else "")
elif cenario == "terminal":                                    # tenta o terminal: com a regra do MaiSim, negado e segue; sem, para
    usa("run_command", CommandLine="python3 controle.py")
    if "command(*)" not in nega:
        para("command")
    resposta = "Permission denied for command(python3 controle.py). Matches user-configured deny rule. Segui sem o terminal."
elif cenario == "fora":                                        # escrever fora da pasta: o agy nega sem janela e para
    usa("write_file", Path=str(Path.home().parent / "fora.txt"))
    para("write_file")
elif cenario == "erro":
    sai("result", {"conversation_id": cid, "status": "ERROR", "response": "", "error": "RESOURCE_EXHAUSTED: quota exceeded",
                   "duration_seconds": 1.0, "num_turns": 1, "usage": uso})
    sys.exit(1)
fala(resposta)
sai("result", {"conversation_id": cid, "status": "SUCCESS", "response": resposta + "\n", "duration_seconds": 3.25, "num_turns": 1, "usage": uso})
