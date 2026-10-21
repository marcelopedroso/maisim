#!/usr/bin/env python3
"""Um `claude` de mentira para testar o "pedir ao Claude" sem gastar a conta (MAISIM_CLAUDE_BIN apontando para cá).

O servidor passa ao filho só um ambiente de lista branca, então o cenário vem de arquivos na pasta de configuração
(CLAUDE_CONFIG_DIR, a descartável da instância de teste):
  falso_logado     existe: `auth status` diz conectado (senão, e no login/logout, chama o claude de verdade)
  falso_cenario    o que fazer no pedido: ganho | metade | quebra | json_ruim | lento | anexo | erro | recusa | modulos | controladores | dois_donos | autonomo | limite | le_contexto | renova | trava | resumo_falha | le_conversa
                   (falso_resumo_lento: o resumo de um contexto demora N s)
                   (o pedido do resumo de um contexto salvo responde sempre com um resumo, sem mexer em arquivo)
  falso_chamadas.jsonl   cada chamada (argumentos e pasta), para o teste conferir as opções
Imita o stream-json do CLI 2.1.273: system/init, assistant (texto e tool_use), user (tool_result) e result."""
import json
import os
import re
import sys
import time
from pathlib import Path

REAL = str(Path.home() / ".local" / "bin" / "claude")
args = sys.argv[1:]
conf = Path(os.environ.get("CLAUDE_CONFIG_DIR", "."))
conf.mkdir(parents=True, exist_ok=True)
with open(conf / "falso_chamadas.jsonl", "a") as f:
    f.write(json.dumps({"args": args, "cwd": os.getcwd()}) + "\n")

if args[:2] == ["auth", "status"] and (conf / "falso_logado").exists():
    print(json.dumps({"loggedIn": True, "authMethod": "claude.ai", "email": "teste@maisim.local", "subscriptionType": "max"}))
    sys.exit(0)
if "-p" not in args:
    os.execv(REAL, [REAL] + args)

prompt = args[args.index("-p") + 1]
if prompt == "/usage":                                   # as datas relativas a hoje (a sessão renova hoje, a semana daqui a 7 dias)
    hoje, semana = time.localtime(), time.localtime(time.time() + 7 * 86400)
    d = lambda t: time.strftime("%b ", t) + str(t.tm_mday)
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "num_turns": 0, "total_cost_usd": 0,
                      "result": "You are currently using your subscription to power your Claude Code usage\n\n"
                                f"Current session: 42% used · resets {d(hoje)}, 1:50pm (America/Sao_Paulo)\n"
                                f"Current week (all models): 81% used · resets {d(semana)}, 12pm (America/Sao_Paulo)\n"
                                f"Current week (Fable): 31% used · resets {d(semana)}, 12pm (America/Sao_Paulo)"}))
    sys.exit(0)
if "stream-json" in args and "--verbose" not in args:   # como o CLI 2.1.273
    print("Error: When using --print, --output-format=stream-json requires --verbose", file=sys.stderr)
    sys.exit(1)

cenario = (conf / "falso_cenario").read_text().strip() if (conf / "falso_cenario").exists() else "ganho"
if "Resuma a conversa do MaiSim guardada nesta pasta" in prompt:   # o resumo pela IA de um contexto salvo: JSON, sem sessão, só leitura
    assert "--no-session-persistence" in args and args[args.index("--tools") + 1] == "Read,Glob,Grep", "resumo: sem sessão e só leitura"
    if (conf / "falso_resumo_lento").exists():
        time.sleep(float((conf / "falso_resumo_lento").read_text() or 3))
    if cenario == "resumo_falha":
        print(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": "API Error: 529 overloaded"}))
        sys.exit(1)
    conv = Path("conversa.md").read_text() if Path("conversa.md").exists() else ""
    n = len(re.findall(r"(?m)^## \d+\. Pedido", conv))
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "model": "claude-falso",
                      "result": f"## Objetivo\nControle (teste).\n\n## O que foi feito\nli conversa.md: {n} pedido(s).\n\n## Resultado\n$i_L$ em 10 A."}))
    sys.exit(0)
# a sessão fica onde o CLI de verdade a guarda, gravada já no começo do pedido (antes de qualquer resposta)
proj = conf / "projects" / re.sub(r"[^A-Za-z0-9]", "-", os.getcwd())
if "--resume" in args:
    sid = args[args.index("--resume") + 1]
    if not (proj / f"{sid}.jsonl").exists():
        print(f"No conversation found with session ID: {sid}", file=sys.stderr)
        sys.exit(1)
else:
    sid = args[args.index("--session-id") + 1]
    if any((conf / "projects").glob(f"*/{sid}.jsonl")):  # como o CLI 2.1.273: --session-id de uma sessão gravada é recusado
        print(f"Error: Session ID {sid} is already in use.", file=sys.stderr)
        sys.exit(1)
    proj.mkdir(parents=True, exist_ok=True)
    (proj / f"{sid}.jsonl").write_text("{}\n")


def sai(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def usa(nome, **ent):
    sai({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": nome, "input": ent}]}})


def fala(txt):
    sai({"type": "assistant", "message": {"content": [{"type": "text", "text": txt}]}})


sai({"type": "system", "subtype": "init", "session_id": sid, "model": "claude-falso", "tools": ["Read", "Edit", "Write", "Glob", "Grep"]})
usa("Read", file_path=str(Path.cwd() / "CONTEXTO.md"))
ctx = Path("CONTEXTO.md").read_text()
negados, resposta = [], "pronto"
if cenario == "trava" and (conf / ".oauth_refresh.lock").exists():   # como o CLI: com a trava de renovação, desiste
    sai({"type": "result", "subtype": "success", "is_error": True, "session_id": sid,
         "result": "Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh. This is usually transient; retry in a minute"})
    sys.exit(1)
if cenario == "renova" and not (conf / "falso_renovou").exists():   # a 1ª vez: o erro passageiro da renovação do login
    (conf / "falso_renovou").write_text("")
    sai({"type": "result", "subtype": "success", "is_error": True, "session_id": sid,
         "result": "Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh. This is usually transient; retry in a minute"})
    sys.exit(1)
if "guardar como um CONTEXTO do MaiSim" in prompt:          # o resumo para salvar o contexto: só texto, nenhum arquivo mexido
    cenario = "resumo"
if cenario == "lento":
    fala("pensando devagar…")
    time.sleep(60)
if cenario == "erro":                                    # erro da API, no formato do CLI 2.1.273
    sai({"type": "result", "subtype": "success", "is_error": True, "api_error_status": 529, "result": "API Error: 529 overloaded", "session_id": sid})
    sys.exit(1)
if cenario == "execucao":                                # erro de execução: o motivo vem em "errors", sem "result"
    sai({"type": "result", "subtype": "error_during_execution", "is_error": True, "errors": ["tool crashed: Edit"], "session_id": sid})
    sys.exit(1)
if cenario in ("ganho", "metade"):
    pars = json.loads(Path("parametros.json").read_text())
    for q in pars:
        if q["nome"] == "Kp":
            q["valor"] = round(q["valor"] * 2, 6)
    pars.append({"nome": "K2", "valor": 7.5, "unidade": "V/A"})
    usa("Edit", file_path="parametros.json")
    Path("parametros.json").write_text(json.dumps(pars, indent=1))
    cod = Path("controle.py").read_text()
    usa("Edit", file_path="controle.py")
    Path("controle.py").write_text(cod.replace("def passo(t, m, p, e):", "def passo(t, m, p, e):\n    _k2 = p[\"K2\"]   # ganho extra (Claude falso)", 1))
    resposta = "Dobrei o **Kp** e criei o parâmetro `K2` = 7,5 V/A."
    if cenario == "metade":
        tfim = float(re.search(r"tfim = ([0-9.e+-]+) s", ctx).group(1))
        acs = json.loads(Path("acionamentos.json").read_text())
        acs.append({"t": tfim / 2, "alvo": "p:Kp", "valor": 9.0})
        usa("Edit", file_path="acionamentos.json")
        Path("acionamentos.json").write_text(json.dumps(acs, indent=1))
        resposta += f" Na metade do tempo (t = {tfim / 2:g} s), Kp vai a 9."
elif cenario == "autonomo":                              # o modo autônomo: versão 1; lê a rodada 1 e faz a 2; na 2, [PRONTO]
    volta = re.search(r"A rodada (\d+) de (\d+)", prompt)
    pars = json.loads(Path("parametros.json").read_text())
    if not volta or volta.group(1) == "1":
        lido = ""
        if volta:
            usa("Read", file_path="ULTIMA_RODADA.md")
            r = Path("ULTIMA_RODADA.md").read_text() if Path("ULTIMA_RODADA.md").exists() else ""
            lido = next((l for l in r.splitlines()[12:] if l.startswith("| ") and "---" not in l), "nada")
        for q in pars:
            if q["nome"] == "Kp":
                q["valor"] = round(q["valor"] * 2, 6)
        usa("Edit", file_path="parametros.json")
        Path("parametros.json").write_text(json.dumps(pars, indent=1))
        resposta = "versão 1: dobrei o Kp" if not volta else f"versão 2: dobrei o Kp de novo (li a rodada 1: {lido})"
    else:
        resposta = "os critérios passaram.\n[PRONTO]"
elif cenario == "limite":                                # modo autônomo: a 1ª chamada estoura o limite de passos no meio da versão
    if "chegou ao limite" in prompt:                      # a continuação termina a versão
        pars = json.loads(Path("parametros.json").read_text())
        for q in pars:
            if q["nome"] == "Kp":
                q["valor"] = round(q["valor"] * 2, 6)
        usa("Edit", file_path="parametros.json")
        Path("parametros.json").write_text(json.dumps(pars, indent=1))
        resposta = "terminei a versão (continuei de onde parei)"
    elif re.search(r"A rodada (\d+) de", prompt):
        resposta = "rodou bem.\n[PRONTO]"
    else:                                                 # a 1ª: começa a versão e estoura o limite
        usa("Write", file_path="ajuda.py")
        Path("ajuda.py").write_text("def iniciar(p):\n    return {}\n\n\ndef passo(x, p, estado):\n    return x\n")
        fala("começando a versão…")
        sai({"type": "result", "subtype": "error_max_turns", "is_error": True, "session_id": sid, "num_turns": 100,
             "duration_ms": 1000, "total_cost_usd": 0.01, "usage": {"input_tokens": 1, "output_tokens": 1}})
        sys.exit(0)
elif cenario == "modulos":                                # etapa B: cria um módulo, chama do controle.py e revisa outro módulo
    usa("Write", file_path="pll.py")
    Path("pll.py").write_text('def iniciar(p):\n    return {"th": 0.0}\n\n\ndef passo(x, p, estado):\n    estado["th"] += 0.01\n    return estado["th"]\n')
    cod = Path("controle.py").read_text()
    usa("Edit", file_path="controle.py")
    cod = cod.replace("import escrita", "import escrita\nimport pll", 1)
    cod = cod.replace('    e["escrita"] = escrita.iniciar(p)', '    e["escrita"] = escrita.iniciar(p)\n    e["pll"] = pll.iniciar(p)', 1)
    cod = cod.replace("    u = {}", '    th = pll.passo(x, p, e["pll"])\n    scope("th", th)\n    u = {}', 1)
    Path("controle.py").write_text(cod)
    if Path("leitura.py").exists():
        usa("Edit", file_path="leitura.py")
        Path("leitura.py").write_text(Path("leitura.py").read_text().replace("return dict(m)", "return dict(m)   # (Claude falso: leitura revisada)", 1))
    resposta = "Criei o **pll.py** (módulo) e chamei no controle.py; revisei o leitura.py."
elif cenario in ("controladores", "dois_donos"):        # 3 DSPs: o controle.py manda pela rede; dsp_a e dsp_b recebem (dsp_a escreve u_ctrl)
    for nome in ("dsp_a", "dsp_b"):
        usa("Write", file_path=f"{nome}.py")
        escreve = 'return {"u_ctrl": e["x"]}' if nome == "dsp_a" or cenario == "dois_donos" else "return {}"
        Path(f"{nome}.py").write_text(f'def iniciar(p, e):\n    e["x"] = 0.0\n\n\ndef passo(t, m, p, e):\n    for msg in recebe():\n        e["x"] = msg["dados"]["x"]\n    {escreve}\n')
    usa("Edit", file_path="controladores.json")
    cj = json.loads(Path("controladores.json").read_text())
    cj["controladores"] = [{"nome": "controle", "arquivo": "controle.py", "todas": True, "medidas": [], "atuacoes": [], "subcircuitos": []},
                           {"arquivo": "dsp_a.py", "todas": False, "medidas": [], "atuacoes": ["u_ctrl"], "subcircuitos": []},
                           {"nome": "dsp_b", "arquivo": "dsp_b.py", "todas": False, "medidas": [], "atuacoes": ["u_ctrl"] if cenario == "dois_donos" else [], "subcircuitos": []}]
    cj["rede"] = {"latencia": 2e-5}
    Path("controladores.json").write_text(json.dumps(cj, indent=1))
    resposta = "Criei **dsp_a** e **dsp_b** como controladores (fibra de 20 µs); o dsp_a escreve u_ctrl."
elif cenario == "memoria":                                # o pedido de lembrar: uma linha na memória do MaiSim
    usa("Edit", file_path="memoria.md")
    Path("memoria.md").write_text(Path("memoria.md").read_text() + "- prefiro anti-windup por clamping\n")
    resposta = "Anotei na memória: anti-windup por clamping."
elif cenario == "perigo":                                  # código que deixa uma marca ao ser EXECUTADO (não pode rodar sozinho)
    usa("Edit", file_path="controle.py")
    marca = conf / "rodou.txt"
    Path("controle.py").write_text(f"open({str(marca)!r}, 'w').write('rodou')\n" + Path("controle.py").read_text())
    resposta = "pus uma linha no começo"
elif cenario == "quebra":
    usa("Edit", file_path="controle.py")
    Path("controle.py").write_text(Path("controle.py").read_text().replace("def passo(t, m, p, e):", "def passo(t, m, p, e)", 1))
    resposta = "mudei o passo"
elif cenario == "json_ruim":
    usa("Edit", file_path="parametros.json")
    Path("parametros.json").write_text("{ isto não é json")
    resposta = "mexi nos parâmetros"
elif cenario == "resumo":
    resposta = ("## Objetivo\nControle do conversor (teste).\n\n## O que foi feito\nDobrei o Kp.\n\n## Resultado\n$i_L$ em 10 A "
                "(canal i_L, janela J5).\n\n## Decisões\nKp dobrado.\n\n## O que falta\nO degrau de carga.")
elif cenario == "le_contexto":                           # lê os contextos salvos que a nota do pedido cita
    lidos = re.findall(r"contextos/([^/]+)/contexto\.md \(([^)]*)\)", prompt)
    titulos = []
    for cid, tit in lidos:
        usa("Read", file_path=f"contextos/{cid}/contexto.md")
        txt = Path("contextos", cid, "contexto.md").read_text()
        titulos.append(txt.splitlines()[0].lstrip("# ").strip())
    resposta = f"li os contextos: {' | '.join(titulos) or 'nenhum'}"
elif cenario == "le_conversa":                          # a troca de IA: lê o CONVERSA.md que o pedido cita
    if "CONVERSA.md" in prompt and Path("CONVERSA.md").exists():
        usa("Read", file_path="CONVERSA.md")
        n = len(re.findall(r"(?m)^## \d+\. Pedido", Path("CONVERSA.md").read_text()))
        resposta = f"li a conversa: {n} pedido(s)"
    else:
        resposta = "sem CONVERSA.md"
elif cenario == "anexo":
    nomes = sorted(x.name for x in Path("anexos").iterdir()) if Path("anexos").is_dir() else []
    for n in nomes:
        usa("Read", file_path=f"anexos/{n}")
    novos = re.findall(r"anexos/([^,()]+?) \(novo\)", prompt)
    resposta = f"li os anexos: {', '.join(nomes) or 'nenhum'}; novos: {', '.join(novos) or 'nenhum'}"
elif cenario == "recusa":
    usa("Edit", file_path="/etc/passwd")
    sai({"type": "user", "message": {"content": [{"type": "tool_result", "is_error": True, "content": "Permission to edit /etc/passwd has been denied."}]}})
    negados = [{"tool_name": "Edit", "tool_input": {"file_path": "/etc/passwd"}}]
    resposta = "não consegui editar fora da pasta"
fala(resposta)
sai({"type": "result", "subtype": "success", "is_error": False, "result": resposta, "session_id": sid, "num_turns": 3,
     "duration_ms": 2345, "total_cost_usd": 0.0123, "permission_denials": negados,
     "usage": {"input_tokens": 120, "cache_creation_input_tokens": 3000, "cache_read_input_tokens": 9000, "output_tokens": 456}})
