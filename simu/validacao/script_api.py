"""O modo script (issue #258), na instância de teste (o simu e o scope do perfil config/teste.env). Confere:
- a lista traz o exemplo sine_pwm e um script salvo; salvar por cima pede confirmação; nome inválido é recusado;
- rodar o exemplo grava uma rodada (planta maisim-script) com t, ref, carrier e pulse de 3 ciclos de 60 Hz, o pulso só
  0 ou 1 e igual a ref > portadora em toda amostra; o layout de dois painéis (ref e carrier; pulse) chega ao Scope;
- o Scope lista a rodada com o nome do script;
- um erro dentro do script volta como erro (não derruba o servidor) e um script que não termina é interrompido no prazo;
- gravar e rodar exigem a página do MaiSim (sem o cabeçalho X-MaiSim: 403); apagar tira o script da lista;
- pastas: criar, um script numa pasta importa outro da mesma pasta (e um da libs/ da raiz), apagar a pasta com tudo;
- os exemplos estão em pastas e todos rodam; copiar um exemplo de projeto traz a pasta inteira (o libs/ junto) e a cópia roda;
- a página do script abre e a tela inicial tem o cartão "+ Novo script"."""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
CONF = (RAIZ / "config/teste.env").read_text()
porta = lambda k, d: int((re.search(rf"(?m)^{k}=(\d+)", CONF) or [None, d])[1])
SIMU = f"http://127.0.0.1:{porta('MAISIM_PORTA_SIMU', 7201)}/maisim/simu/"
SCOPE = f"http://127.0.0.1:{porta('MAISIM_PORTA_SCOPE', 7202)}/maisim/scope/"
PAGINA = f"http://127.0.0.1:{porta('MAISIM_PORTA_PAGINA', 7200)}/"

falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t, flush=True)
    falhas += (not c)


def acha(itens, caminho):
    """O item (pasta ou script) de um caminho na árvore da lista."""
    for x in itens:
        if x["caminho"] == caminho:
            return x
        if x["tipo"] == "pasta" and caminho.startswith(x["caminho"] + "/"):
            return acha(x["filhos"], caminho)
    return None


def scripts(itens):
    return [x["caminho"] for x in itens if x["tipo"] == "script"] + sum((scripts(x["filhos"]) for x in itens if x["tipo"] == "pasta"), [])


def pede(url, corpo=None, maisim=True):
    h = {"Content-Type": "application/json"}
    if maisim:
        h["X-MaiSim"] = "1"
    req = urllib.request.Request(url, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=180)
        dado = r.read()
        return r.status, (json.loads(dado) if dado[:1] in (b"{", b"[") else dado.decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        dado = e.read()
        return e.code, (json.loads(dado) if dado[:1] == b"{" else {})


try:
    # a lista e o exemplo
    c, j = pede(SIMU + "scripts")
    ok(c == 200 and acha(j["exemplos"], "pwm/sine_pwm") is not None, "a lista traz o exemplo pwm/sine_pwm (numa pasta)")
    exemplos = scripts(j["exemplos"])
    c, j = pede(SIMU + "scripts/ler?nome=pwm/sine_pwm&grupo=exemplos")
    ok(c == 200 and "maisim.scope(" in j["codigo"], "o exemplo abre com o código")
    c, j = pede(SIMU + "scripts/novo")
    ok(c == 200 and "import maisim" in j["codigo"], "o modelo de um script novo")

    # rodar o exemplo: a rodada, os sinais e o layout
    c, r = pede(SIMU + "scripts/rodar", {"nome": "pwm/sine_pwm", "grupo": "exemplos"})
    ok(c == 200 and r["ok"] and len(r["rodadas"]) == 1, f"o exemplo roda e grava uma rodada ({r.get('tempo')} s; {r.get('erro', '')[-200:]})")
    if r.get("rodadas"):
        z = np.load(r["rodadas"][0]["arquivo"], allow_pickle=True)
        meta = json.loads(str(z["meta"]))
        t, ref, port, pulso = z["t"], z["ref"], z["carrier"], z["pulse"]
        ok(meta["planta"] == "maisim-script" and meta["modelo"].replace("\\", "/").endswith("pwm/sine_pwm.py") and meta.get("script") == "pwm/sine_pwm",
           "a rodada é de script e aponta para o .py (com o caminho dele)")
        ok(abs(t[-1] + (t[1] - t[0]) - 3 / 60) < 1e-6, f"3 ciclos de 60 Hz (t final {t[-1]:.6f} s)")
        ok(set(np.unique(pulso)) <= {0.0, 1.0} and np.array_equal(pulso, (ref > port).astype(float)), "o pulso é ref > portadora em toda amostra")
        ok(abs(port.max() - 1) < 1e-3 and abs(port.min() + 1) < 1e-3, "a portadora vai de -1 a 1")
        c, L = pede(SIMU + "scope/padrao?modelo=" + urllib.request.quote(meta["modelo"]))
        sinais = [x.get("sinais") for x in (L.get("layout") or {}).get("itens", [])]
        ok(sinais == [["ref", "carrier"], ["pulse"]], f"o Scope recebe os dois painéis do script ({sinais})")
        c, rods = pede(SCOPE + "rodadas")
        nomes = [x.get("rotulo", "") + " " + x.get("nome", "") for x in rods] if isinstance(rods, list) else []
        ok(any("sine_pwm" in n for n in nomes), "o Scope lista a rodada do script")

    # salvar, sobrescrever, nome inválido
    pede(SIMU + "scripts/apagar", {"nome": "teste_script"})
    c, j = pede(SIMU + "scripts/salvar", {"nome": "teste_script", "codigo": "print('oi do script')\n"})
    ok(c == 200 and j.get("ok"), "salva um script novo")
    c, j = pede(SIMU + "scripts/salvar", {"nome": "teste_script", "codigo": "print('de novo')\n"})
    ok(j.get("codigo") == "confirmar", "salvar por cima pede confirmação")
    c, j = pede(SIMU + "scripts/salvar", {"nome": "nome com espaço", "codigo": "x"})
    ok(c == 409, "nome inválido é recusado")
    c, j = pede(SIMU + "scripts")
    ok(acha(j["meus"], "teste_script") is not None, "o script salvo aparece em Meus scripts")
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_script"})
    ok(r.get("ok") and r["saida"].strip() == "oi do script" and not r["rodadas"], "roda e devolve o print, sem rodada")
    # outra execução ao mesmo tempo (noutra aba) grava uma rodada durante esta: não conta como desta (sem a marca da vez)
    pede(SIMU + "scripts/salvar", {"nome": "teste_script_vez", "sobrescrever": True, "codigo":
         "import os, time, numpy as np, maisim\nd = os.path.join(os.environ['MAISIM_SCRIPT_RODADAS'], time.strftime('%H%M%S') + '_outra_aba')\n"
         "os.makedirs(d)\nnp.savez(os.path.join(d, 'scope_outra.npz'), t=[0, 1])\nmaisim.scope('minha', [0, 1], {'a': [1, 2]})\n"})
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_script_vez"})
    ok(r.get("ok") and [x["pasta"].endswith("_minha") for x in r.get("rodadas", [])] == [True],
       f"a rodada de outra execução ao mesmo tempo não entra na lista desta ({[x['pasta'] for x in r.get('rodadas', [])]}; {r.get('erro', '')[-200:]})")

    # erro e prazo
    pede(SIMU + "scripts/salvar", {"nome": "teste_script_erro", "codigo": "import maisim\nmaisim.scope('x', [0, 1], {'a': [1]})\n", "sobrescrever": True})
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_script_erro"})
    ok(c == 200 and not r["ok"] and "ValueError" in r["erro"], "um erro no script volta como erro")
    c, j = pede(SIMU + "scripts")
    ok(c == 200, "o servidor segue de pé depois do erro")

    # só a página do MaiSim grava e roda
    c, _ = pede(SIMU + "scripts/rodar", {"nome": "teste_script"}, maisim=False)
    ok(c == 403, "rodar sem o cabeçalho X-MaiSim é recusado")
    c, _ = pede(SIMU + "scripts/salvar", {"nome": "teste_script", "codigo": "x", "sobrescrever": True}, maisim=False)
    ok(c == 403, "salvar sem o cabeçalho X-MaiSim é recusado")

    # apagar
    for n in ("teste_script", "teste_script_erro", "teste_script_vez"):
        pede(SIMU + "scripts/apagar", {"nome": n})
    c, j = pede(SIMU + "scripts")
    ok(not any(x.startswith("teste_script") for x in scripts(j["meus"])), "apagar tira os scripts da lista")

    # pastas e import: um projeto com dois scripts (um chama o outro) e uma libs/ na raiz que serve a todos
    for n in ("teste_proj", "libs_teste_raiz"):
        pede(SIMU + "scripts/pasta/apagar", {"nome": n})
    c, j = pede(SIMU + "scripts/pasta/criar", {"nome": "teste_proj/sub"})
    ok(c == 200 and j.get("ok"), "cria pasta dentro de pasta")
    pede(SIMU + "scripts/salvar", {"nome": "libs_teste_raiz/util", "codigo": "def dobro(x):\n    return 2 * x\n"})
    pede(SIMU + "scripts/salvar", {"nome": "teste_proj/calc", "codigo": "def soma(a, b):\n    return a + b\n"})
    pede(SIMU + "scripts/salvar", {"nome": "teste_proj/main", "codigo":
         "import os\nfrom calc import soma\nfrom libs_teste_raiz.util import dobro\nprint(soma(2, 3), dobro(4), os.path.basename(os.getcwd()))\n"})
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_proj/main"})
    ok(r.get("ok") and r["saida"].split() == ["5", "8", "teste_proj"], f"o main importa o vizinho e a libs da raiz, na pasta dele ({r.get('saida')!r} {r.get('erro', '')[-200:]})")
    c, j = pede(SIMU + "scripts")
    ok(acha(j["meus"], "teste_proj/sub") is not None and acha(j["meus"], "teste_proj/main") is not None, "a árvore mostra a pasta, a subpasta e o script")
    ok(acha(j["meus"], "teste_proj/__pycache__") is None, "a árvore não mostra __pycache__")
    c, j = pede(SIMU + "scripts/salvar", {"nome": "teste_proj/sub", "codigo": "x"})
    ok(c == 409, "um script com o nome de uma pasta é recusado")
    c, j = pede(SIMU + "scripts/salvar", {"nome": "../fora", "codigo": "x"})
    ok(c == 409, "um caminho que sai da pasta dos scripts é recusado")
    c, j = pede(SIMU + "scripts/pasta/apagar", {"nome": "teste_proj"}, maisim=False)
    ok(c == 403, "apagar pasta sem o cabeçalho X-MaiSim é recusado")
    for n in ("teste_proj", "libs_teste_raiz"):
        pede(SIMU + "scripts/pasta/apagar", {"nome": n})
    c, j = pede(SIMU + "scripts")
    ok(acha(j["meus"], "teste_proj") is None, "apagar a pasta tira tudo o que estava nela")

    # a rodada de antes: substituída pela nova de mesmo nome (o padrão, como no circuito), menos a guardada e a de outro
    # script; "nova" grava sempre mais uma
    cod = "import maisim\nmaisim.scope('rep', [0, 1], {'a': [1, 2]})\n"
    pede(SIMU + "scripts/salvar", {"nome": "teste_rep", "codigo": cod, "sobrescrever": True})
    pede(SIMU + "scripts/salvar", {"nome": "teste_rep_outro", "codigo": cod, "sobrescrever": True})
    c, r1 = pede(SIMU + "scripts/rodar", {"nome": "teste_rep"})
    pasta_rods = Path(r1["rodadas"][0]["arquivo"]).parent.parent
    do_rep = lambda: sorted(d.name for d in pasta_rods.iterdir() if d.name.endswith("_rep") and (d / "scope_rep.npz").exists()
                            and '"teste_rep"' in str(np.load(d / "scope_rep.npz", allow_pickle=True)["meta"]))
    c, ro = pede(SIMU + "scripts/rodar", {"nome": "teste_rep_outro"})
    time.sleep(1.1)                                       # (o nome da pasta tem o segundo)
    c, r2 = pede(SIMU + "scripts/rodar", {"nome": "teste_rep"})
    ok(do_rep() == [r2["rodadas"][0]["pasta"]] and Path(ro["rodadas"][0]["arquivo"]).exists(),
       f"rodar de novo substitui a rodada de mesmo nome do script; a de outro script fica ({do_rep()})")
    (Path(r2["rodadas"][0]["arquivo"]).parent / ".guardada").write_text("")
    time.sleep(1.1)
    c, r3 = pede(SIMU + "scripts/rodar", {"nome": "teste_rep", "rodada": "nova"})
    time.sleep(1.1)
    c, r4 = pede(SIMU + "scripts/rodar", {"nome": "teste_rep", "rodada": "nova"})
    ok(len(do_rep()) == 3, f"\"sempre nova\": as rodadas ficam todas ({do_rep()})")
    time.sleep(1.1)
    c, r5 = pede(SIMU + "scripts/rodar", {"nome": "teste_rep"})
    ok(do_rep() == sorted([r2["rodadas"][0]["pasta"], r5["rodadas"][0]["pasta"]]), f"substituir apaga as de antes, menos a guardada no Scope ({do_rep()})")
    import shutil as _sh
    for x in (r2, r5, ro):
        _sh.rmtree(Path(x["rodadas"][0]["arquivo"]).parent, ignore_errors=True)
    for n in ("teste_rep", "teste_rep_outro"):
        pede(SIMU + "scripts/apagar", {"nome": n})

    # duas rodadas com painéis diferentes no mesmo script: cada uma chega ao Scope com os painéis dela; sem a rodada, a última
    pede(SIMU + "scripts/pasta/apagar", {"nome": "teste_duas"})
    pede(SIMU + "scripts/salvar", {"nome": "teste_duas/s", "codigo": "import maisim\nmaisim.scope('ra', [0, 1], {'x': [1, 2], 'y': [0, 1]}, panels=[['x'], ['y']])\n"
                                                                    "maisim.scope('rb', [0, 1], {'z': [3, 4]}, panels=[['z']])\n"})
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_duas/s"})
    mod = json.loads(str(np.load(r["rodadas"][0]["arquivo"], allow_pickle=True)["meta"]))["modelo"] if r.get("rodadas") else ""
    lay = lambda q: [x.get("sinais") for x in (pede(SIMU + "scope/padrao?modelo=" + urllib.request.quote(mod) + q)[1].get("layout") or {}).get("itens", [])]
    la, lb, l0 = lay("&rodada=ra"), lay("&rodada=rb"), lay("")
    ok(la == [["x"], ["y"]] and lb == [["z"]] and l0 == [["z"]], f"duas rodadas, cada uma com os painéis dela ({la}, {lb}; sem a rodada: {l0})")
    pede(SIMU + "scope/padrao", {"modelo": mod, "layout": {"itens": [{"titulo": "y", "sinais": ["y"], "largura": 1}], "colunas": 1}, "rodada": "ra"})
    ok(lay("&rodada=ra") == [["y"]] and lay("&rodada=rb") == [["z"]], "o Layout ▾ da rodada ra guarda só o dela; o da rb fica")
    pede(SIMU + "scripts/pasta/apagar", {"nome": "teste_duas"})

    # renomear (no mesmo lugar) e a cópia do exemplo com o nome escolhido
    for n in ("teste_ren", "teste_ren2", "sessao_teste"):
        pede(SIMU + "scripts/pasta/apagar", {"nome": n})
    pede(SIMU + "scripts/salvar", {"nome": "teste_ren/a", "codigo": "import maisim\nmaisim.scope('ren', [0, 1], {'a': [1, 2]}, panels=[['a']])\n"})
    pede(SIMU + "scripts/salvar", {"nome": "teste_ren/b", "codigo": "x = 1\n"})
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_ren/a"})
    modelo_a = json.loads(str(np.load(r["rodadas"][0]["arquivo"], allow_pickle=True)["meta"]))["modelo"]
    c, j = pede(SIMU + "scripts/renomear", {"nome": "teste_ren/a", "novo": "c"})
    c2, L = pede(SIMU + "scope/padrao?modelo=" + urllib.request.quote(modelo_a.replace("\\", "/").replace("teste_ren/a.py", "teste_ren/c.py")))
    ok(c == 200 and j.get("nome") == "teste_ren/c" and [x.get("sinais") for x in (L.get("layout") or {}).get("itens", [])] == [["a"]],
       f"renomear um script: no mesmo lugar, e o layout do Scope vai junto ({j})")
    c, j = pede(SIMU + "scripts/renomear", {"nome": "teste_ren/c", "novo": "b"})
    ok(c == 409, f"renomear para um nome que já existe ali é recusado ({j.get('erro')})")
    c, j = pede(SIMU + "scripts/renomear", {"nome": "teste_ren", "novo": "teste_ren2"})
    c2, L = pede(SIMU + "scripts/ler?nome=teste_ren2/c")
    ok(c == 200 and j.get("nome") == "teste_ren2" and c2 == 200, f"renomear uma pasta: os scripts vão junto ({j})")
    c, j = pede(SIMU + "scripts/renomear", {"nome": "teste_ren2", "novo": "nome com espaço"})
    ok(c == 409, "um nome inválido é recusado")
    c, j = pede(SIMU + "scripts/copiar_exemplo", {"nome": "pwm/sine_pwm", "destino": "sessao_teste"})
    ok(c == 200 and j.get("nome") == "sessao_teste/sine_pwm",
       f"copiar um exemplo com o nome escolhido: a pasta inteira, com esse nome ({j})")
    c, j = pede(SIMU + "scripts/copiar_exemplo", {"nome": "pwm/sine_pwm", "destino": "sessao_teste"})
    ok(c == 409, "o mesmo nome de novo: recusado (não mistura com o que já existe)")
    for n in ("teste_ren2", "sessao_teste"):
        pede(SIMU + "scripts/pasta/apagar", {"nome": n})

    # mover: um script para uma pasta (o layout vai junto), uma pasta para dentro de outra, as recusas
    for n in ("teste_mv_a", "teste_mv_b"):
        pede(SIMU + "scripts/pasta/apagar", {"nome": n})
    pede(SIMU + "scripts/pasta/criar", {"nome": "teste_mv_a"}); pede(SIMU + "scripts/pasta/criar", {"nome": "teste_mv_b/sub"})
    pede(SIMU + "scripts/salvar", {"nome": "teste_mv_a/s1", "codigo": "import maisim\nmaisim.scope('s1', [0, 1], {'a': [1, 2]}, panels=[['a']])\n"})
    c, r = pede(SIMU + "scripts/rodar", {"nome": "teste_mv_a/s1"})
    meta_mod = json.loads(str(np.load(r["rodadas"][0]["arquivo"], allow_pickle=True)["meta"]))["modelo"] if r.get("rodadas") else ""
    c, j = pede(SIMU + "scripts/mover", {"nome": "teste_mv_a/s1", "destino": "teste_mv_b/sub"})
    ok(c == 200 and j.get("nome") == "teste_mv_b/sub/s1", f"move um script para outra pasta ({j})")
    c, L = pede(SIMU + "scripts/ler?nome=teste_mv_b/sub/s1")
    ok(c == 200 and "maisim.scope" in L.get("codigo", ""), "o script está no lugar novo, com o código")
    c, L = pede(SIMU + "scope/padrao?modelo=" + urllib.request.quote(meta_mod.replace("\\", "/").replace("teste_mv_a/s1.py", "teste_mv_b/sub/s1.py")))
    ok([x.get("sinais") for x in (L.get("layout") or {}).get("itens", [])] == [["a"]], "o layout do Scope foi junto")
    pede(SIMU + "scripts/salvar", {"nome": "teste_mv_a/s1", "codigo": "x\n"})
    c, j = pede(SIMU + "scripts/mover", {"nome": "teste_mv_a/s1", "destino": "teste_mv_b/sub"})
    ok(c == 409, f"um nome que já existe no destino é recusado, nada é substituído ({j.get('erro')})")
    c, j = pede(SIMU + "scripts/mover", {"nome": "teste_mv_b", "destino": "teste_mv_b/sub"})
    ok(c == 409, f"uma pasta para dentro dela mesma é recusada ({j.get('erro')})")
    c, j = pede(SIMU + "scripts/mover", {"nome": "teste_mv_b", "destino": "teste_mv_a"})
    c2, L = pede(SIMU + "scripts/ler?nome=teste_mv_a/teste_mv_b/sub/s1")
    ok(c == 200 and j.get("nome") == "teste_mv_a/teste_mv_b" and c2 == 200, f"move uma pasta inteira para dentro de outra ({j})")
    c, j = pede(SIMU + "scripts/mover", {"nome": "teste_mv_a/teste_mv_b", "destino": ""})
    ok(c == 200 and j.get("nome") == "teste_mv_b", f"e de volta para a raiz ({j})")
    c, j = pede(SIMU + "scripts/mover", {"nome": "pwm/sine_pwm", "destino": "teste_mv_a"})
    ok(c == 409, "um exemplo não se move (não está nos seus scripts)")
    c, _ = pede(SIMU + "scripts/mover", {"nome": "teste_mv_b", "destino": "teste_mv_a"}, maisim=False)
    ok(c == 403, "mover sem o cabeçalho X-MaiSim é recusado")
    for n in ("teste_mv_a", "teste_mv_b"):
        pede(SIMU + "scripts/pasta/apagar", {"nome": n})

    # os exemplos: todos rodam; o de projeto copia a pasta inteira e a cópia roda
    for ex in [x for x in exemplos if "/libs/" not in x]:   # os da libs/ são módulos que o main importa, não rodam sozinhos
        c, r = pede(SIMU + "scripts/rodar", {"nome": ex, "grupo": "exemplos"})
        ok(c == 200 and r.get("ok") and len(r["rodadas"]) == 1, f"o exemplo {ex} roda e grava uma rodada ({r.get('tempo')} s; {r.get('erro', '')[-200:]})")
    ok(len(exemplos) >= 6, f"os exemplos ({len(exemplos)}): {exemplos}")
    c, j = pede(SIMU + "scripts/copiar_exemplo", {"nome": "inverter_project/main"})
    copia = j.get("nome", "")
    ok(c == 200 and copia.startswith("inverter_project_copia") and copia.endswith("/main"), f"copiar o exemplo de projeto ({copia})")
    c, r = pede(SIMU + "scripts/rodar", {"nome": copia})
    ok(r.get("ok") and len(r["rodadas"]) == 1, "a cópia roda (o libs/ veio junto)")
    if copia:
        pede(SIMU + "scripts/pasta/apagar", {"nome": copia.split("/")[0]})

    # as páginas
    c, h = pede(SIMU + "script")
    ok(c == 200 and "static/script.js" in h, "a página do script abre")
    c, h = pede(PAGINA)
    ok(c == 200 and 'href="/maisim/simu/script"' in h, "a tela inicial tem o cartão + Novo script")
except Exception as e:
    ok(False, f"exceção: {e!r}")

print(f"\nscript_api: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
