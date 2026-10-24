"""Mudanças não salvas (circuito, controle, cores) ao abrir, no novo e no pendente — instância de teste (7201)."""
import json, urllib.request, subprocess, os, sys
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
SOBE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "..", "tmp")   # (não usado)
REINICIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reinicia_servidor_teste.sh")
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
SALVOS = Path.home() / ".cache/maisim_teste/circuitos"
A, PI = str(SALVOS / "nao_salvo_a.ipes"), "exemplos/exemplo_controle_pi.ipes"
# um arquivo da pasta do MaiSim (salvável), sem controle nem cores
api("editor/novo", {"modo": "descartar"}); c("CREATE", ["R.1", 10, 10, "R"]); c("CREATE", ["U.1", 4, 10, "U"])
for n, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "gnd")): c("INNODE", [n, 0, i]); c("OUTNODE", [n, 0, o])
api("editor/salvar", {"nome": "nao_salvo_a", "pasta": "circuitos", "sobrescrever": True})
ok(api("editor/pendente").get("pendente") is False, "salvo: nada pendente")
# 1. mesmo arquivo: nunca reabre; mudança vista fica sem perguntar
c("SETP", ["U.1", "upperLimit", 50.0])
r = api("editor/abrir", {"arq": A}); ok("ERRO" not in r and r.get("mantido"), "edição do editor + reabrir o mesmo: fica, sem perguntar")
# 2. controle de trabalho mexido fora da edição + reabrir o mesmo: o controle fica (não é recarregado)
api("editor/abrir", {"arq": A, "modo": "descartar"})
ctl = api("editor/controle")["controle"]; ctl["parametros"] = [{"nome": "k", "valor": 3.0}]
api("editor/controle", {"controle": ctl})
r = api("editor/abrir", {"arq": A}); k = api("editor/controle")["controle"]["parametros"]
ok("ERRO" not in r and k == [{"nome": "k", "valor": 3.0, "unidade": ""}], f"controle mexido + reabrir o mesmo: o controle fica ({k})")
p = api("editor/pendente"); ok(p.get("pendente") is True and p.get("itens") == ["o controle"], f"pendente (npm run maisim): {p.get('motivo')}")
# 3. abrir outro com o controle não salvo: pergunta; salvar e abrir grava o controle junto
r = api("editor/abrir", {"arq": PI}); ok(r.get("ERRO") == 409 and r.get("itens") == ["o controle"] and r.get("salvavel"), f"abrir outro: pergunta ({r.get('erro')})")
r = api("editor/abrir", {"arq": PI, "modo": "salvar"})
ok("ERRO" not in r and (SALVOS / "nao_salvo_a.controle.json").exists(), "salvar e abrir: o controle foi junto (nao_salvo_a.controle.json)")
# 4. cores não salvas também contam
api("editor/abrir", {"arq": A, "modo": "descartar"}); api("editor/cor", {"canal": "x", "cor": "#123456"})
p = api("editor/pendente"); ok(p.get("itens") == ["a aparência (cores e pontas)"], f"cor escolhida e não salva: {p.get('motivo')}")
api("editor/abrir", {"arq": A, "modo": "descartar"})
ok(api("editor/pendente").get("pendente") is False, "descartar: volta ao arquivo (controle e cores dele)")
# 5. novo com mudança não salva: pergunta; salvar e criar; descartar e criar
c("MOVE", ["R.1", 12, 10])
r = api("editor/novo", {}); ok(r.get("ERRO") == 409 and r.get("novo") and r.get("itens") == ["o circuito"], f"novo com mudança: pergunta ({r.get('erro')})")
r = api("editor/novo", {"modo": "salvar"})
sys.path.insert(0, "..")
import ipes
x = next(e["x"] for e in ipes.monta(A)["folhas"]["0"]["elementos"] if e["nome"] == "R.1")
ok("ERRO" not in r and x == 12, f"salvar e criar: o arquivo ficou com a mudança (x = {x}) e a folha está em branco")
c("CREATE", ["R.9", 10, 10, "R"])
r = api("editor/novo", {}); ok(r.get("ERRO") == 409 and "circuito novo" in r.get("erro", ""), "novo sobre um circuito novo com algo: pergunta")
r = api("editor/novo", {"modo": "descartar"}); ok("ERRO" not in r, "descartar e criar")
# 6. reiniciar o servidor: o que o editor viu fica em disco — não pergunta à toa
api("editor/abrir", {"arq": A, "modo": "descartar"}); c("MOVE", ["R.1", 14, 10])
subprocess.run([REINICIA])
r = api("editor/abrir", {"arq": A}); ok("ERRO" not in r and r.get("mantido"), "edição do editor, servidor reiniciado, reabrir: fica, sem perguntar")
# 7. mudança que o editor não viu (simulada: o "visto" apagado e o servidor reiniciado): pergunta manter/descartar
(Path.home() / ".cache/maisim_teste/visto.txt").write_text("outro")
subprocess.run([REINICIA])
r = api("editor/abrir", {"arq": A}); ok(r.get("ERRO") == 409 and r.get("mesmo") is True, f"mudança não vista: pergunta ({r.get('erro')})")
r = api("editor/abrir", {"arq": A, "modo": "manter"}); x = next(e["x"] for e in r["folhas"]["0"]["elementos"] if e["nome"] == "R.1")
ok(r.get("mantido") and x == 14, f"manter: fica o que está no Gecko (x = {x})")
# um circuito novo (a folha em branco, o controle padrão, que já traz o leitura.py e o escrita.py de modelo) não tem nada por
# salvar: antes os arquivos-modelo contavam como controle em uso, e todo circuito novo parecia ter controle sem salvar
api("editor/novo", {"modo": "descartar"})
r = api("editor/pendente")
ok(r.get("pendente") is False and not r.get("itens"), f"circuito novo, intocado: nada por salvar ({r.get('itens')})")
api("editor/abrir", {"arq": A, "modo": "descartar"})
print("falhas:", falhas)
