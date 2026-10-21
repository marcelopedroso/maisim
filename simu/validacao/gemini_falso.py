#!/usr/bin/env python3
"""Um `gemini` de mentira para testar o Gemini como IA do MaiSim sem a conta Google (MAISIM_GEMINI_BIN apontando para cá).

O cenário vem de arquivos na pasta de configuração (GEMINI_CLI_HOME, a descartável da instância de teste):
  falso_cenario    o pedido: ganho | le_conversa | recusa | cota | limite | lento | resumo_falha | inelegivel
  falso_login_lento  o login demora N s para mostrar o link
  falso_chamadas.jsonl   cada chamada (argumentos, pasta, as chaves do ambiente, a política e o GEMINI.md), para o teste
O login é o do CLI 0.63.0 com NO_BROWSER num terminal: o link do Google, "Enter the authorization code: ", e o código
"4/codigo-bom-123" entra (grava .gemini/oauth_creds.json e .gemini/google_accounts.json, como o CLI); outro dá o erro do
CLI. O pedido (-p) imita o stream-json do CLI 0.63.0 (init, message em pedaços, tool_use, tool_result, result) e OBEDECE à
política passada em --admin-policy: uma escrita fora do argsPattern é negada (policy_violation) — o teste confere a trava."""
import json
import os
import re
import sys
import time
from pathlib import Path

args = sys.argv[1:]
casa = Path(os.environ.get("GEMINI_CLI_HOME", "."))
g = casa / ".gemini"
g.mkdir(parents=True, exist_ok=True)
pol_arq = args[args.index("--admin-policy") + 1] if "--admin-policy" in args else None
pol = Path(pol_arq).read_text() if pol_arq and Path(pol_arq).exists() else ""
with open(casa / "falso_chamadas.jsonl", "a") as f:
    f.write(json.dumps({"args": args, "cwd": os.getcwd(), "env": sorted(os.environ), "politica": pol,
                        "politica_base": (g / "policies" / "maisim_base.toml").read_text() if (g / "policies" / "maisim_base.toml").exists() else "",
                        "gemini_md": Path("GEMINI.md").read_text()[:200] if Path("GEMINI.md").exists() else None,
                        "tty": os.isatty(0), "no_browser": os.environ.get("NO_BROWSER")}) + "\n")
cenario = (casa / "falso_cenario").read_text().strip() if (casa / "falso_cenario").exists() else "ganho"


def dorme():                                             # o CLI interativo fica aberto até alguém fechar
    while True:
        time.sleep(1)


# ---------------------------------------------------------------- o login (interativo, sem -p)
if "-p" not in args:
    if os.environ.get("NO_BROWSER") != "true" or not os.isatty(0):
        print("o login de mentira precisa de NO_BROWSER=true e de um terminal", file=sys.stderr)
        sys.exit(2)
    if (casa / "falso_login_lento").exists():
        time.sleep(float((casa / "falso_login_lento").read_text() or 3))
    sys.stdout.write("\x1b[2K\x1b[1G Waiting for auth... (Press ESC or CTRL+C to cancel)\r\n")
    sys.stdout.write("Please visit the following URL to authorize the application:\r\n\r\n"
                     "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fcodeassist.google.com%2Fauthcode"
                     "&access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform&code_challenge_method=S256"
                     "&code_challenge=falso&state=falso&response_type=code&client_id=falso.apps.googleusercontent.com\r\n\r\n")
    sys.stdout.write("Enter the authorization code: ")
    sys.stdout.flush()
    codigo = sys.stdin.readline().strip()
    if codigo == "4/codigo-bom-123":
        (g / "oauth_creds.json").write_text(json.dumps({"falso": True}))
        time.sleep(0.5)
        (g / "google_accounts.json").write_text(json.dumps({"active": "teste@gmail.com", "old": []}))
        sys.stdout.write("\r\nAuthentication succeeded\r\n")
        sys.stdout.flush()
    else:
        sys.stderr.write("Failed to authenticate with authorization code:invalid_grant\r\n")
        sys.stderr.flush()
    dorme()

prompt = args[args.index("-p") + 1]
saida = args[args.index("--output-format") + 1] if "--output-format" in args else "text"
if not (g / "oauth_creds.json").exists():                # como o CLI 0.63.0 sem login, fora de um terminal
    print("Error authenticating: FatalAuthenticationError: Manual authorization is required but the current session is "
          "non-interactive. Please run the Gemini CLI in an interactive terminal to log in.", file=sys.stderr)
    sys.exit(41)
if "--skip-trust" not in args:
    print("Error: this folder is not trusted (use --skip-trust)", file=sys.stderr)
    sys.exit(1)
if 'toolName = "*"\ndecision = "deny"' not in pol:      # sem a política do MaiSim, o de mentira se recusa (o teste vê)
    print("gemini_falso: sem a política do MaiSim (--admin-policy)", file=sys.stderr)
    sys.exit(3)

if cenario == "inelegivel":                             # a recusa do Google a contas pessoais (21/10), como o CLI 0.63/0.65 a imprime
    print("Error authenticating: IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. "
          "To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google\n"
          "    at throwIneligibleOrProjectIdError (file:///x/chunk.js:1:1)\n    at _doSetupUser (file:///x/chunk.js:2:2)\n"
          "    at process.processTicksAndRejections (node:internal/process/task_queues:103:5) {\n  ineligibleTiers: [\n    {\n"
          "      reasonCode: 'UNSUPPORTED_CLIENT',\n      tierId: 'free-tier'\n    }\n  ]\n}", file=sys.stderr)
    sys.exit(1)
stats = {"total_tokens": 1500, "input_tokens": 1200, "output_tokens": 300, "cached": 0, "input": 1200, "duration_ms": 2100,
         "tool_calls": 2, "models": {"gemini-falso-2.5": {"total_tokens": 1500, "input_tokens": 1200, "output_tokens": 300}}}

# ---------------------------------------------------------------- o resumo de um contexto salvo (-o json, uma saída)
if "Resuma a conversa do MaiSim guardada nesta pasta" in prompt:
    assert saida == "json" and "argsPattern" not in pol, "resumo: JSON e só leitura"
    if cenario == "resumo_falha":
        print(json.dumps({"session_id": "x", "error": {"type": "TerminalQuotaError", "message": "You have exhausted your daily quota", "code": 1}}, indent=2),
              file=sys.stderr)
        sys.exit(1)
    conv = Path("conversa.md").read_text() if Path("conversa.md").exists() else ""
    n = len(re.findall(r"(?m)^## \d+\. Pedido", conv))
    print(json.dumps({"session_id": "x", "response": f"## Objetivo\nControle (teste).\n\n## O que foi feito\nGemini leu conversa.md: {n} pedido(s).",
                      "stats": {"models": {"gemini-falso-2.5": {"tokens": {"prompt": 10, "candidates": 5}}}}}, indent=2))
    sys.exit(0)

if saida != "stream-json":
    print("gemini_falso: o pedido do MaiSim é em stream-json", file=sys.stderr)
    sys.exit(4)

# a sessão onde o CLI a guarda: .gemini/tmp/<projeto>/chats/session-<quando>-<8 primeiros do id>.json
chats = g / "tmp" / Path.cwd().name / "chats"
if "--resume" in args:
    sid = args[args.index("--resume") + 1]
    if not list(chats.glob(f"session-*-{sid[:8]}.json")):
        print(f'Error resuming session: Invalid session identifier "{sid}".', file=sys.stderr)
        sys.exit(1)
else:
    sid = args[args.index("--session-id") + 1]
    if list((g / "tmp").glob(f"*/chats/session-*-{sid[:8]}.json")):
        print(f"Error: session id {sid} is already in use", file=sys.stderr)
        sys.exit(1)
    chats.mkdir(parents=True, exist_ok=True)
    (chats / f"session-{time.strftime('%Y-%m-%dT%H-%M')}-{sid[:8]}.json").write_text(json.dumps({"sessionId": sid}))

m = re.search(r"argsPattern = '([^']*)'", pol)
padrao = re.compile(m.group(1)) if m else None         # a mesma expressão que o CLI testa (o \x00 e o \/ valem no Python)
NEGA = re.search(r'denyMessage = "([^"]*)"', pol).group(1)
n_ferr = [0]


def sai(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def fala(*pedacos):
    for p in pedacos:
        sai({"type": "message", "role": "assistant", "content": p, "delta": True})


def usa(nome, **ent):
    n_ferr[0] += 1
    tid = f"{nome}-{n_ferr[0]}"
    sai({"type": "tool_use", "tool_name": nome, "tool_id": tid, "parameters": ent})
    return tid


def escreve(nome, arq, texto):
    """Uma escrita (write_file/replace) que só acontece se a política deixa — como o CLI."""
    ent = {"file_path": arq, "content": texto} if nome == "write_file" else {"file_path": arq, "old_string": "", "new_string": texto}
    tid = usa(nome, **ent)
    alvo = "".join(f"\0{json.dumps(k)}:{json.dumps(ent[k])}\0" for k in sorted(ent))
    if not (padrao and padrao.search(alvo)):
        sai({"type": "tool_result", "tool_id": tid, "status": "error", "error": {"type": "policy_violation", "message": NEGA}})
        return False
    Path(arq).write_text(texto)
    sai({"type": "tool_result", "tool_id": tid, "status": "success", "output": "ok"})
    return True


def le(arq):
    tid = usa("read_file", file_path=arq)
    sai({"type": "tool_result", "tool_id": tid, "status": "success", "output": ""})
    return Path(arq).read_text() if Path(arq).exists() else ""


sai({"type": "init", "timestamp": "2026-10-21T00:00:00Z", "session_id": sid, "model": "auto-gemini-2.5"})
sai({"type": "message", "role": "user", "content": prompt})
le(str(Path.cwd() / "CONTEXTO.md"))
if cenario == "lento":
    fala("pensando devagar…")
    time.sleep(60)
if cenario == "cota":
    sai({"type": "result", "status": "error", "error": {"type": "TerminalQuotaError",
         "message": "You have exhausted your daily quota on this model."}, "stats": {**stats, "duration_ms": 0}})
    sys.exit(1)
if cenario == "limite":
    sai({"type": "error", "severity": "error", "message": "Maximum session turns exceeded"})
    sai({"type": "result", "status": "error", "error": {"type": "FatalTurnLimitedError",
         "message": "Reached max session turns for this session."}, "stats": {**stats, "duration_ms": 0}})
    sys.exit(53)
resposta = ["pronto"]
if cenario == "ganho":
    fala("Vou dobrar ", "o Kp e criar o K2.")
    pars = json.loads(Path("parametros.json").read_text())
    for q in pars:
        if q["nome"] == "Kp":
            q["valor"] = round(q["valor"] * 2, 6)
    pars.append({"nome": "K2", "valor": 7.5, "unidade": "V/A"})
    escreve("write_file", str(Path.cwd() / "parametros.json"), json.dumps(pars, indent=1))
    cod = Path("controle.py").read_text()
    escreve("replace", "controle.py", cod.replace("def passo(t, m, p, e):", "def passo(t, m, p, e):\n    _k2 = p[\"K2\"]   # ganho extra (Gemini falso)", 1))
    resposta = ["Dobrei o **Kp** ", "e criei o parâmetro `K2` = 7,5 V/A."]
elif cenario == "recusa":                                # tenta escrever fora do que a política deixa: tudo negado
    fala("Vou tentar mexer em outros arquivos.")
    ok = [escreve("write_file", "/etc/passwd", "x"), escreve("write_file", "CONTEXTO.md", "x"),
          escreve("write_file", "../fora.py", "x"), escreve("write_file", "sub/x.py", "x")]
    resposta = [f"escritas que passaram: {sum(ok)} de {len(ok)}"]
elif cenario == "le_conversa":
    if "CONVERSA.md" in prompt and Path("CONVERSA.md").exists():
        n = len(re.findall(r"(?m)^## \d+\. Pedido", le("CONVERSA.md")))
        resposta = [f"li a conversa: {n} pedido(s)"]
    else:
        resposta = ["sem CONVERSA.md"]
fala(*resposta)
sai({"type": "result", "timestamp": "2026-10-21T00:00:02Z", "status": "success", "stats": stats})
