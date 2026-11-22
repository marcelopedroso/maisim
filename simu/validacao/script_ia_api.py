"""A IA do script (modo script, #258) pela API, na instância de teste, com o claude de mentira (claude_falso.py, cenário
"script"), sem gastar a conta. Confere:
- a conversa do script: a pasta tem o projeto (o script e a libs/, com a subpasta), o GUIA_SCRIPT.md e o CONTEXTO.md com a
  saída, os erros e os sinais da última vez que a pessoa rodou;
- as opções: as regras do modo script, Edit/Write só de .py, restrito;
- a proposta: os .py mudados e o novo (na subpasta), a sintaxe conferida sem executar; nada é gravado antes de Aplicar;
  Aplicar grava (só no projeto) e não aplica duas vezes; um arquivo com erro de sintaxe aparece marcado;
- a página do circuito vê que a última proposta é de outro lugar (não a mostra como dela);
- a conversa segue o script ao renomear e mover (também a pasta); apagar a esquece;
- nova conversa limpa o histórico; um exemplo (não está nos seus) é recusado; sem X-MaiSim: 403."""
import json, os, subprocess, time, urllib.parse, urllib.request
from pathlib import Path

B = "http://127.0.0.1:7201/maisim/simu/"
from _servidor import ambiente  # noqa: E402
ENV = ambiente()
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com MAISIM_CLAUDE_BIN=…/claude_falso.py"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
assert "maisim_teste" in str(CONF) or "/tmp/" in str(CONF), "MAISIM_CLAUDE_DIR tem de ser uma pasta descartável"
CONF.mkdir(parents=True, exist_ok=True)
SCRIPTS = Path(os.path.expanduser(ENV.get("MAISIM_SCRIPTS") or "")) if ENV.get("MAISIM_SCRIPTS") else Path(ENV["MAISIM_DADOS"]).expanduser() / "scripts"
PROJ = "teste_ia"

falhas = 0
def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t, flush=True)
    falhas += (not c)


def api(rota, corpo=None, maisim=True):
    h = {"Content-Type": "application/json", **({"X-MaiSim": "1"} if maisim else {})}
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


def estado(nome):
    return api("scripts/ia?nome=" + urllib.parse.quote(nome))


def espera(nome):
    for _ in range(120):
        e = estado(nome)
        if not (e.get("pedido") or {}).get("andamento"):
            return e
        time.sleep(0.5)
    return e


def pede(nome, texto, arquivos):
    (CONF / "falso_cenario").write_text("script")
    (CONF / "falso_script.json").write_text(json.dumps(arquivos))
    r = api("scripts/ia/pedir", {"nome": nome, "texto": texto})
    return r if "ERRO" in r else espera(nome)


def chamadas():
    f = CONF / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []


(CONF / "falso_logado").write_text("")
(CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
try:
    api("scripts/pasta/apagar", {"nome": PROJ})
    MAIN = "import maisim\nfrom libs import calc\nprint('ola', calc.dobro(21))\nmaisim.scope('r1', [0, 1, 2], {'v_o': [1, 2, 3]})\nraise SystemExit('erro_de_teste')\n"
    api("scripts/salvar", {"nome": f"{PROJ}/main", "codigo": MAIN})
    api("scripts/salvar", {"nome": f"{PROJ}/libs/calc", "codigo": "def dobro(x):\n    return 2 * x\n"})
    api("scripts/ia/nova", {"nome": f"{PROJ}/main"})   # a conversa limpa (uma rodada anterior do teste pode ter caído no meio)
    r = api("scripts/rodar", {"nome": f"{PROJ}/main"})
    ok(not r.get("ok") and "ola 42" in r.get("saida", "") and r.get("rodadas"), f"o script roda uma vez (saída, erro e uma rodada): {r.get('saida', '').strip()}")

    # o pedido: muda o main e cria a libs/novo.py
    NOVO_MAIN = MAIN.replace("raise SystemExit('erro_de_teste')\n", "print('corrigido')\n")
    e = pede(f"{PROJ}/main", "tire o erro do fim", {"main.py": NOVO_MAIN, "libs/novo.py": "def um():\n    return 1\n"})
    p = e.get("pedido") or {}
    prop = p.get("proposta") or {}
    ok(not p.get("erro") and prop.get("tipo") == "script" and sorted(prop.get("arquivos", {})) == ["libs/novo.py", "main.py"],
       f"a proposta: o main mudado e o novo na subpasta ({sorted(prop.get('arquivos', {}))}; erro: {p.get('erro')})")
    ok(prop.get("novos") == ["libs/novo.py"] and not prop.get("sintaxe") and prop.get("arquivos_antes", {}).get("main.py") == MAIN,
       f"o que é novo, a sintaxe sem erro e o antes guardado ({prop.get('novos')}, {prop.get('sintaxe')})")
    resp = p.get("resposta") or ""
    ok("guia: sim" in resp and "libs/calc.py" in resp, f"a IA leu o guia e tinha o projeto, com a subpasta: {resp[:160]}")
    ch = [c for c in chamadas() if "stream-json" in c["args"]][-1]
    args = ch["args"]
    regras = args[args.index("--append-system-prompt") + 1]
    ok("Edit(./**/*.py)" in args and "--restricted" in args and ("modo script" in regras or "script mode" in regras) and "controle.py" not in regras,
       "as opções: restrito, Edit de .py, as regras do modo script (não as do controle)")
    ctx = (Path(ch["cwd"]) / "CONTEXTO.md").read_text()
    ok("main.py" in ctx and "ola 42" in ctx and "erro_de_teste" in ctx and "v_o" in ctx and "libs/calc.py" in ctx,
       "o CONTEXTO.md: o script, os outros arquivos, a saída, o erro e os sinais da última execução")
    ok((SCRIPTS / PROJ / "main.py").read_text() == MAIN and not (SCRIPTS / PROJ / "libs" / "novo.py").exists(), "nada gravado antes de Aplicar")
    circ = api("claude/pedido")
    ok(circ.get("outro_circuito") is True, "a conversa do circuito vê que a proposta é de outro lugar (não a mostra como dela)")

    # aplicar
    r = api("scripts/ia/aplicar", {"nome": f"{PROJ}/main"})
    ok(r.get("ok") and (SCRIPTS / PROJ / "main.py").read_text() == NOVO_MAIN and (SCRIPTS / PROJ / "libs" / "novo.py").exists(),
       f"Aplicar grava o main e o novo, no projeto ({r.get('arquivos')})")
    r = api("scripts/ia/aplicar", {"nome": f"{PROJ}/main"})
    ok(r.get("ERRO") == 409, "não aplica duas vezes")
    h = estado(f"{PROJ}/main").get("historico") or []
    ok(len(h) == 1 and h[-1].get("aplicada") and h[-1].get("mudou"), "a conversa guarda o pedido, aplicado")
    NOVO_MAIN = (SCRIPTS / PROJ / "main.py").read_text()

    # o Revisar: os recusados ficam como estão; recusar todos não aplica nada
    e = pede(f"{PROJ}/main", "mude os dois", {"main.py": NOVO_MAIN + "# v2\n", "libs/novo.py": "def um():\n    return 2\n"})
    r = api("scripts/ia/aplicar", {"nome": f"{PROJ}/main", "recusados": ["main.py", "libs/novo.py"]})
    ok(r.get("ERRO") == 409 and (SCRIPTS / PROJ / "main.py").read_text() == NOVO_MAIN, "recusar todos no Revisar: nada é aplicado")
    r = api("scripts/ia/aplicar", {"nome": f"{PROJ}/main", "recusados": ["main.py"]})
    ok(r.get("ok") and r.get("arquivos") == [f"{PROJ}/libs/novo"] and (SCRIPTS / PROJ / "main.py").read_text() == NOVO_MAIN
       and "return 2" in (SCRIPTS / PROJ / "libs" / "novo.py").read_text(), f"recusar o main no Revisar: só o outro é gravado ({r.get('arquivos')})")

    # sintaxe errada: aparece marcada (e não é executada)
    e = pede(f"{PROJ}/main", "quebre", {"main.py": "def (:\n"})
    prop = (e.get("pedido") or {}).get("proposta") or {}
    ok("main.py" in (prop.get("sintaxe") or {}), f"um arquivo com erro de sintaxe aparece marcado ({prop.get('sintaxe')})")
    api("scripts/ia/descartar", {"nome": f"{PROJ}/main"})
    ok(not ((estado(f"{PROJ}/main").get("pedido") or {}).get("proposta")) and (SCRIPTS / PROJ / "main.py").read_text() == NOVO_MAIN,
       "Descartar tira a proposta e não grava nada")

    # um script na raiz (sem pasta de projeto): só ele vai para a conversa, e aplicar grava na raiz
    api("scripts/salvar", {"nome": "teste_ia_raiz", "codigo": "print(1)\n", "sobrescrever": True})
    api("scripts/ia/nova", {"nome": "teste_ia_raiz"})
    e = pede("teste_ia_raiz", "mude", {"teste_ia_raiz.py": "print(2)\n"})
    prop = (e.get("pedido") or {}).get("proposta") or {}
    resp = (e.get("pedido") or {}).get("resposta") or ""
    ok(list(prop.get("arquivos", {})) == ["teste_ia_raiz.py"] and "arquivos: teste_ia_raiz.py;" in resp,
       f"script na raiz: só ele na conversa e na proposta ({resp[:120]})")
    r = api("scripts/ia/aplicar", {"nome": "teste_ia_raiz"})
    ok(r.get("ok") and (SCRIPTS / "teste_ia_raiz.py").read_text() == "print(2)\n", "aplicar grava o script da raiz")
    # a conversa segue o script: renomear e mover (também a pasta, com os scripts dela) levam a conversa; apagar a esquece
    api("scripts/apagar", {"nome": "teste_ia_raiz2"})
    api("scripts/pasta/apagar", {"nome": "teste_ia_dest"})
    h_raiz, h_main = estado("teste_ia_raiz").get("historico") or [], estado(f"{PROJ}/main").get("historico") or []
    r = api("scripts/renomear", {"nome": "teste_ia_raiz", "novo": "teste_ia_raiz2"})
    ok(r.get("nome") == "teste_ia_raiz2" and h_raiz and estado("teste_ia_raiz2").get("historico") == h_raiz,
       f"renomear o script: a conversa vai junto ({len(h_raiz)} entrada(s))")
    api("scripts/salvar", {"nome": "teste_ia_raiz", "codigo": "print(3)\n"})
    ok(estado("teste_ia_raiz").get("historico") == [], "um script novo com o nome antigo começa com a conversa vazia")
    api("scripts/apagar", {"nome": "teste_ia_raiz"})
    api("scripts/pasta/criar", {"nome": "teste_ia_dest"})
    r = api("scripts/mover", {"nome": PROJ, "destino": "teste_ia_dest"})
    ok(r.get("nome") == f"teste_ia_dest/{PROJ}" and h_main and estado(f"teste_ia_dest/{PROJ}/main").get("historico") == h_main,
       f"mover a pasta: a conversa de cada script dela vai junto ({len(h_main)} entrada(s))")
    r = api("scripts/renomear", {"nome": f"teste_ia_dest/{PROJ}", "novo": "teste_ia_x"})
    ok(estado("teste_ia_dest/teste_ia_x/main").get("historico") == h_main, "renomear a pasta: a conversa vai junto")
    api("scripts/renomear", {"nome": "teste_ia_dest/teste_ia_x", "novo": PROJ})
    api("scripts/mover", {"nome": f"teste_ia_dest/{PROJ}", "destino": ""})
    ok(estado(f"{PROJ}/main").get("historico") == h_main, "e de volta ao lugar, com a conversa")
    api("scripts/pasta/apagar", {"nome": "teste_ia_dest"})
    api("scripts/apagar", {"nome": "teste_ia_raiz2"})
    api("scripts/salvar", {"nome": "teste_ia_raiz2", "codigo": "print(4)\n"})
    ok(estado("teste_ia_raiz2").get("historico") == [], "apagar o script esquece a conversa: o de mesmo nome, criado depois, começa vazio")
    api("scripts/apagar", {"nome": "teste_ia_raiz2"})

    # recusas e nova conversa
    r = api("scripts/ia/pedir", {"nome": "pwm/sine_pwm", "texto": "oi"})
    ok(r.get("ERRO") == 409, f"um exemplo (não está nos seus scripts) é recusado ({r.get('erro')})")
    r = api("scripts/ia/pedir", {"nome": f"{PROJ}/main", "texto": "oi"}, maisim=False)
    ok(r.get("ERRO") == 403, "pedir sem o cabeçalho X-MaiSim é recusado")
    e = api("scripts/ia/nova", {"nome": f"{PROJ}/main"})
    ok(e.get("historico") == [] and not e.get("pedido"), "nova conversa: o histórico vazio")
except Exception as ex:
    ok(False, f"exceção: {ex!r}")
finally:
    api("scripts/pasta/apagar", {"nome": PROJ})
    for f in ("falso_cenario", "falso_script.json"):
        (CONF / f).unlink(missing_ok=True)

print(f"\nscript_ia_api: {falhas} falha(s)")
raise SystemExit(1 if falhas else 0)
