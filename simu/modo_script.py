"""O modo script (issue #258): um script Python comum, que roda do começo ao fim, sem circuito e sem o GeckoCIRCUITS, e
manda os resultados para o Scope por `maisim.scope(...)` (simu/script_api/maisim.py).

Tudo fica dentro do MaiSim:
- os scripts em MAISIM_SCRIPTS (padrão MAISIM_DADOS/scripts), um <nome>.py cada; os exemplos em simu/scripts_exemplo/,
  só para ler (abrir um exemplo e salvar faz uma cópia nos seus);
- o script roda num processo à parte, com a pasta dos scripts como pasta de trabalho e prazo (MAISIM_SCRIPT_PRAZO);
- as rodadas que ele grava vão sempre para as rodadas do MaiSim (MAISIM_RODADAS), que o Scope lista.

Organiza onde as coisas ficam, mas não isola o processo: um script Python abre qualquer arquivo que o usuário abre. A página
avisa disso. Só biblioteca padrão aqui (o numpy é do script, não do servidor)."""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from pathlib import Path

import lingua

AQUI = Path(__file__).resolve().parent
API = AQUI / "script_api"                    # onde está o `maisim` que o script importa
EXEMPLOS = AQUI / "scripts_exemplo"
NOME_OK = re.compile(r"^[A-Za-z0-9_-]{1,64}$")  # cada parte do caminho (pastas e o nome do script)
MAX_FUNDO = 6                                # pastas dentro de pastas (o caminho tem até 6 partes)
MAX_CODIGO = 500_000                         # caracteres de um script
MAX_SAIDA = 200_000                          # caracteres da saída (print e erros) que voltam para a página
# o modelo de um script novo: o código é o mesmo nos dois idiomas, só os comentários vêm do dicionário (script.modelo_*)
PADRAO_NOVO = '''"""{doc}"""
import numpy as np
import maisim

t = np.arange(0, 0.05, 1e-5)                 # {c_t}
v = np.sin(2 * np.pi * 60 * t)               # {c_v}

maisim.scope("senoide", t, {{"v": v}})         # {c_scope}
print(len(t))
'''


def pasta_scripts():
    return Path(os.environ.get("MAISIM_SCRIPTS") or Path(os.environ["MAISIM_DADOS"]).expanduser() / "scripts").expanduser()


def pasta_rodadas():
    return Path(os.environ.get("MAISIM_RODADAS") or Path(os.environ["MAISIM_DADOS"]).expanduser() / "rodadas").expanduser()


def prazo():
    try:
        return max(1.0, float(os.environ.get("MAISIM_SCRIPT_PRAZO") or 120))
    except ValueError:
        return 120.0


class ErroScript(Exception):
    pass


def caminho(nome):
    """O caminho de um script ou pasta, relativo à raiz: "projeto1/libs/util" (sem .py). Cada parte: letras, números, _ e -."""
    nome = str(nome or "").strip().replace("\\", "/").strip("/")
    if nome.endswith(".py"):
        nome = nome[:-3]
    partes = nome.split("/")
    if not nome or len(partes) > MAX_FUNDO or not all(NOME_OK.match(x) for x in partes):
        raise ErroScript(lingua.tr("script.nome_invalido"))
    return "/".join(partes)


def raiz(grupo="meus"):
    return EXEMPLOS if grupo == "exemplos" else pasta_scripts()


def arquivo(nome, grupo="meus"):
    """O .py de um script; grupo "exemplos" lê dos exemplos do MaiSim."""
    return raiz(grupo) / f"{caminho(nome)}.py"


def _arvore(base, rel=""):
    """As pastas (primeiro) e os scripts de uma pasta, por nome. Pula o que não é nome de script (__pycache__, .ocultas)."""
    pasta = base / rel if rel else base
    pastas, scripts = [], []
    for f in sorted(pasta.iterdir(), key=lambda x: x.name.lower()) if pasta.is_dir() else []:
        c = f"{rel}/{f.stem if f.is_file() else f.name}".lstrip("/")
        if f.is_dir() and NOME_OK.match(f.name) and not f.name.startswith("__") and c.count("/") < MAX_FUNDO - 1:
            pastas.append({"tipo": "pasta", "nome": f.name, "caminho": c, "filhos": _arvore(base, c)})
        elif f.is_file() and f.suffix == ".py" and NOME_OK.match(f.stem):
            scripts.append({"tipo": "script", "nome": f.stem, "caminho": c, "alterado": f.stat().st_mtime})
    return pastas + scripts


def lista():
    """A árvore dos seus scripts e a dos exemplos (pastas primeiro, depois os scripts, por nome)."""
    return {"meus": _arvore(pasta_scripts()), "exemplos": _arvore(EXEMPLOS), "pasta": str(pasta_scripts())}


def le(nome, grupo="meus"):
    f = arquivo(nome, grupo)
    if not f.is_file():
        raise ErroScript(lingua.tr("script.nao_achei", nome=caminho(nome)))
    return {"nome": caminho(nome), "grupo": grupo, "codigo": f.read_text(encoding="utf-8")}


def novo_codigo():
    return PADRAO_NOVO.format(doc=lingua.tr("script.modelo_doc"), c_t=lingua.tr("script.modelo_t"), c_v=lingua.tr("script.modelo_v"),
                              c_scope=lingua.tr("script.modelo_scope"))


def salva(nome, codigo, sobrescrever=False):
    """Grava nos seus scripts (cria as pastas do caminho). Um nome que já existe pede confirmação (codigo "confirmar")."""
    nome = caminho(nome)
    codigo = str(codigo or "")
    if len(codigo) > MAX_CODIGO:
        raise ErroScript(lingua.tr("script.grande", max=MAX_CODIGO))
    f = pasta_scripts() / f"{nome}.py"
    if (pasta_scripts() / nome).is_dir():
        raise ErroScript(lingua.tr("script.e_pasta", nome=nome))
    if f.exists() and not sobrescrever:
        return {"ok": False, "codigo": "confirmar", "pergunta": lingua.tr("script.ja_existe", nome=nome)}
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(codigo, encoding="utf-8")
    return {"ok": True, "nome": nome}


def apaga(nome):
    nome = caminho(nome)
    f = pasta_scripts() / f"{nome}.py"
    if not f.is_file():
        raise ErroScript(lingua.tr("script.nao_achei", nome=nome))
    f.unlink()
    arquivo_layout(f).unlink(missing_ok=True)       # o layout dos painéis que ele gravou
    return {"ok": True}


def cria_pasta(nome):
    nome = caminho(nome)
    d = pasta_scripts() / nome
    if (pasta_scripts() / f"{nome}.py").exists() or d.is_file():
        raise ErroScript(lingua.tr("script.ja_existe", nome=nome))
    d.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "nome": nome}


def apaga_pasta(nome):
    """Apaga uma pasta dos seus scripts com tudo dentro (a página pergunta antes, dizendo quantos scripts)."""
    nome = caminho(nome)
    d = pasta_scripts() / nome
    if not d.is_dir():
        raise ErroScript(lingua.tr("script.nao_achei", nome=nome))
    for f in d.rglob("*.py"):
        arquivo_layout(f).unlink(missing_ok=True)
    shutil.rmtree(d)
    return {"ok": True}


def move(nome, destino):
    """Leva um script ou uma pasta dos seus scripts para outra pasta (destino "" = a raiz), com o nome que tem. O layout do
    Scope de cada script vai junto. Recusa: o que não existe, o destino que não é pasta, uma pasta para dentro dela mesma, um
    nome que já existe no destino (nada é substituído) e um caminho fundo demais. Devolve o caminho novo."""
    nome = caminho(nome)
    destino = caminho(destino) if str(destino or "").strip("/ ") else ""
    raiz_m = pasta_scripts()
    script, pasta = raiz_m / f"{nome}.py", raiz_m / nome
    if not script.is_file() and not pasta.is_dir():
        raise ErroScript(lingua.tr("script.nao_achei", nome=nome))
    if destino and not (raiz_m / destino).is_dir():
        raise ErroScript(lingua.tr("script.nao_achei", nome=destino))
    if pasta.is_dir() and not script.is_file() and (destino == nome or destino.startswith(nome + "/")):
        raise ErroScript(lingua.tr("script.mover_dentro", nome=nome))
    base = nome.rsplit("/", 1)[-1]
    novo = f"{destino}/{base}" if destino else base
    if novo == nome:
        return {"ok": True, "nome": novo}
    eh_script = script.is_file()
    fundo = novo.count("/") + 1 + (max((len(f.relative_to(pasta).parts) for f in pasta.rglob("*")), default=0) if not eh_script else 0)
    if fundo > MAX_FUNDO:
        raise ErroScript(lingua.tr("script.nome_invalido"))
    alvo = raiz_m / (f"{novo}.py" if eh_script else novo)
    if alvo.exists() or (raiz_m / (novo if eh_script else f"{novo}.py")).exists():
        raise ErroScript(lingua.tr("script.mover_existe", nome=base, destino=destino or "/"))
    # os layouts: os caminhos de antes e de depois de cada script (antes de mover, enquanto os arquivos estão no lugar velho)
    pares = [(script, alvo)] if eh_script else [(f, alvo / f.relative_to(pasta)) for f in pasta.rglob("*.py")]
    layouts = [(arquivo_layout(a), arquivo_layout(b)) for a, b in pares]
    shutil.move(str(script if eh_script else pasta), str(alvo))
    for a, b in layouts:
        if a.is_file():
            b.parent.mkdir(parents=True, exist_ok=True)
            a.replace(b)
    return {"ok": True, "nome": novo}


def copia_exemplo(nome):
    """Um exemplo para os seus scripts, para editar: copia a pasta de cima dele inteira (os outros arquivos que ele importa
    vêm junto) ou, se está na raiz, só ele. Se o nome já existe nos seus, ganha _copia (_copia2…). Devolve o caminho da cópia."""
    nome = caminho(nome)
    if not (EXEMPLOS / f"{nome}.py").is_file():
        raise ErroScript(lingua.tr("script.nao_achei", nome=nome))
    topo, _, resto = nome.partition("/")
    origem = EXEMPLOS / topo if resto else EXEMPLOS / f"{topo}.py"
    n, novo = 1, topo + "_copia"
    while (pasta_scripts() / novo).exists() or (pasta_scripts() / f"{novo}.py").exists():
        n += 1
        novo = f"{topo}_copia{n}"
    pasta_scripts().mkdir(parents=True, exist_ok=True)
    if resto:
        shutil.copytree(origem, pasta_scripts() / novo, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        return {"ok": True, "nome": f"{novo}/{resto}"}
    shutil.copyfile(origem, pasta_scripts() / f"{novo}.py")
    return {"ok": True, "nome": novo}


def _corta(s):
    return s if len(s) <= MAX_SAIDA else s[:MAX_SAIDA] + "\n" + lingua.tr("script.saida_cortada")


RODADA_MODOS = ("substitui", "nova")   # a rodada nova substitui a anterior de mesmo nome (como no circuito) ou fica junto


def roda(nome, grupo="meus", rodada="substitui"):
    """Roda o script salvo num processo à parte e devolve a saída e as rodadas que ele gravou. Bloqueia até o fim ou o prazo."""
    f = arquivo(nome, grupo)
    if not f.is_file():
        raise ErroScript(lingua.tr("script.nao_achei", nome=caminho(nome)))
    nome = caminho(nome)
    pasta_scripts().mkdir(parents=True, exist_ok=True)
    # a pasta de trabalho: a do script (um exemplo, que é só para ler, roda na raiz dos seus scripts). O import acha o que está
    # ao lado do script (o Python põe a pasta dele no caminho) e o que está na raiz (uma pasta libs/ na raiz serve a todos)
    pasta = f.parent if grupo != "exemplos" else pasta_scripts()
    rodadas = pasta_rodadas()
    rodadas.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join([str(API), str(raiz(grupo))] + ([env["PYTHONPATH"]] if env.get("PYTHONPATH") else []))
    if rodada not in RODADA_MODOS:
        rodada = "substitui"
    env["MAISIM_SCRIPT_RODADA"] = rodada              # o maisim.scope apaga as de antes (substitui), menos as guardadas
    vez = uuid.uuid4().hex                           # esta execução: o maisim.scope marca as rodadas dela (MARCA_VEZ)
    env.update({"MAISIM_SCRIPT_NOME": nome, "MAISIM_SCRIPT_VEZ": vez, "PYTHONDONTWRITEBYTECODE": "1", "MAISIM_SCRIPT_ARQ": str(f), "MAISIM_SCRIPT_RODADAS": str(rodadas),
                "MAISIM_SCRIPT_LAYOUT": str(arquivo_layout(f)), "PYTHONIOENCODING": "utf-8",
                "MPLBACKEND": "Agg"})            # sem janela de gráfico: as figuras do matplotlib só em arquivo
    ja = {d.name for d in rodadas.iterdir()}         # as pastas de antes: as novas são as que o script gravou
    antes = time.time()
    try:
        p = subprocess.run([sys.executable, str(f)], cwd=str(pasta), env=env, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=prazo())
        codigo, saida, erro, estourou = p.returncode, p.stdout, p.stderr, False
    except subprocess.TimeoutExpired as e:
        codigo, estourou = None, True
        saida = (e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        erro = ((e.stderr or b"").decode("utf-8", "replace") if isinstance(e.stderr, bytes) else (e.stderr or "")) + \
            "\n" + lingua.tr("script.prazo", s=f"{prazo():g}")
    novas = []
    for d in sorted(rodadas.iterdir()) if rodadas.is_dir() else []:
        # as pastas novas desta execução: com a marca dela (outra execução ao mesmo tempo, noutra aba, grava as suas)
        npz = next(iter(d.glob("scope_*.npz")), None) if d.is_dir() and d.name not in ja and _da_vez(d, vez) else None
        if npz is not None:
            novas.append({"pasta": d.name, "arquivo": str(npz)})
    r = {"ok": codigo == 0, "codigo_saida": codigo, "prazo_estourado": estourou, "tempo": round(time.time() - antes, 3),
         "saida": _corta(saida), "erro": _corta(erro), "rodadas": novas}
    if grupo != "exemplos":
        _guarda_ultima(nome, r)
    return r


ULTIMA_MAX = 6000                            # caracteres da saída e dos erros guardados da última execução (para a IA)


def _arquivo_ultima(nome):
    return pasta_scripts() / ".ultima" / f"{caminho(nome).replace('/', '__')}.json"


def _sinais_npz(arq):
    """Os nomes dos sinais de um scope_*.npz, sem numpy (o servidor só usa a biblioteca padrão): os .npy dentro do zip."""
    try:
        with zipfile.ZipFile(arq) as z:
            return [n[:-4] for n in z.namelist() if n.endswith(".npy") and n[:-4] not in ("t", "meta")]
    except (OSError, zipfile.BadZipFile):
        return []


def _guarda_ultima(nome, r):
    """A última execução de um script dos seus (a saída e os erros, cortados; as rodadas e os sinais): o que a IA do script
    lê para saber o que aconteceu quando a pessoa rodou."""
    d = {"quando": time.time(), "ok": r["ok"], "codigo_saida": r["codigo_saida"], "prazo_estourado": r["prazo_estourado"],
         "tempo": r["tempo"], "saida": r["saida"][-ULTIMA_MAX:], "erro": r["erro"][-ULTIMA_MAX:],
         "rodadas": [{"pasta": x["pasta"], "arquivo": x["arquivo"], "sinais": _sinais_npz(x["arquivo"])} for x in r["rodadas"]]}
    f = _arquivo_ultima(nome)
    try:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError:
        pass


def ultima(nome):
    try:
        return json.loads(_arquivo_ultima(nome).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def ultima_rodada(nome):
    """O arquivo da rodada mais nova que o script gravou da última vez (se ainda existe: substituída ou apagada, não)."""
    u = ultima(nome) or {}
    for x in reversed(u.get("rodadas") or []):
        if x.get("arquivo") and Path(x["arquivo"]).is_file():
            return {"arquivo": x["arquivo"], "pasta": x.get("pasta")}
    return {"arquivo": None}


# ----------------------------------------------------------------- a IA do script (a conversa de um script, no servidor)
# O MaiSim monta a pasta da conversa com o PROJETO do script: os .py da pasta de cima dele (um script na raiz: só ele),
# com as subpastas; mais o CONTEXTO.md (qual é o script, os outros arquivos, a última execução) e o GUIA_SCRIPT.md. A IA
# edita ali; a proposta são os .py que ela mudou ou criou (lidos de volta, a sintaxe conferida SEM executar). Aplicar grava
# nos seus scripts, só dentro do projeto. Nada roda sozinho: quem roda é a pessoa, depois de ver a diferença.
GUIA = AQUI / "GUIA_SCRIPT.md"
PROJETO_MAX = 60                             # arquivos .py de um projeto que vão para a conversa
ARQ_MAX = 200_000                            # caracteres de um arquivo do projeto


def projeto(nome):
    """(a pasta do projeto nos seus scripts, o caminho do script dentro dela, o prefixo do projeto): a pasta de cima do script
    ("proj/main" → proj/, "main.py", "proj"); um script na raiz é um projeto de um arquivo só."""
    nome = caminho(nome)
    if "/" in nome:
        topo, resto = nome.split("/", 1)
        return pasta_scripts() / topo, f"{resto}.py", topo
    return pasta_scripts(), f"{nome}.py", ""


def _arquivos_projeto(base, so=None):
    """{caminho relativo: código} dos .py do projeto (sem __pycache__ nem pastas ocultas); so: só esse (o script da raiz)."""
    if so is not None:
        f = base / so
        return {so: f.read_text(encoding="utf-8", errors="replace")[:ARQ_MAX]} if f.is_file() else {}
    out = {}
    for f in sorted(base.rglob("*.py")):
        rel = f.relative_to(base).as_posix()
        if any(p.startswith((".", "__")) for p in rel.split("/")[:-1]) or len(out) >= PROJETO_MAX:
            continue
        out[rel] = f.read_text(encoding="utf-8", errors="replace")[:ARQ_MAX]
    return out


def monta_conversa(nome, pasta):
    """Reescreve a pasta da conversa com o estado de agora (os anexos ficam) e devolve {rel: código} de antes."""
    base, rel, topo = projeto(nome)
    if not (base / rel).is_file():
        raise ErroScript(lingua.tr("script.nao_achei", nome=caminho(nome)))
    for f in list(pasta.rglob("*")):                 # o estado de antes sai (menos os anexos)
        if f.is_file() and "anexos" not in f.relative_to(pasta).parts:
            f.unlink()
    arqs = _arquivos_projeto(base, None if topo else rel)
    for r, cod in arqs.items():
        (pasta / r).parent.mkdir(parents=True, exist_ok=True)
        (pasta / r).write_text(cod, encoding="utf-8")
    guia = AQUI / ("GUIA_SCRIPT.en.md" if lingua.atual() == "en" else "GUIA_SCRIPT.md")
    shutil.copyfile(guia if guia.is_file() else GUIA, pasta / "GUIA_SCRIPT.md")
    (pasta / "CONTEXTO.md").write_text(_contexto(nome, rel, topo, arqs), encoding="utf-8")
    return arqs


def _contexto(nome, rel, topo, arqs):
    """O CONTEXTO.md da conversa: o script, os outros arquivos do projeto e a última execução (no idioma do pedido)."""
    t = lingua.tr
    linhas = [t("script.ia_ctx_titulo"), "", t("script.ia_ctx_script", arq=rel, nome=caminho(nome))]
    outros = [r for r in arqs if r != rel]
    linhas.append(t("script.ia_ctx_projeto", pasta=topo) if topo else t("script.ia_ctx_raiz"))
    if outros:
        linhas += ["", t("script.ia_ctx_outros")] + [f"- {r}" for r in outros]
    u = ultima(nome)
    linhas += ["", t("script.ia_ctx_ultima_titulo")]
    if not u:
        linhas.append(t("script.ia_ctx_nunca"))
    else:
        quando = time.strftime("%Y-%m-%d %H:%M", time.localtime(u.get("quando") or 0))
        linhas.append(t("script.ia_ctx_ultima", quando=quando, tempo=u.get("tempo"),
                        estado=t("script.ia_ctx_ok") if u.get("ok") else t("script.ia_ctx_prazo") if u.get("prazo_estourado")
                        else t("script.ia_ctx_erro", c=u.get("codigo_saida"))))
        for x in u.get("rodadas") or []:
            linhas.append(t("script.ia_ctx_rodada", pasta=x.get("pasta"), sinais=", ".join(x.get("sinais") or []) or "-"))
        if u.get("saida"):
            linhas += ["", t("script.ia_ctx_saida"), "```", u["saida"].rstrip(), "```"]
        if u.get("erro"):
            linhas += ["", t("script.ia_ctx_erros"), "```", u["erro"].rstrip(), "```"]
    return "\n".join(linhas) + "\n"


def proposta(pasta, antes, nome):
    """O que a IA deixou: os .py do projeto que mudaram ou são novos (lidos de volta; nunca executados). A sintaxe é conferida
    com compile() (só lê). Caminhos que não servem de nome de script (espaço, ..) ficam de fora, em "recusados"."""
    arqs, recusados = {}, []
    for f in sorted(pasta.rglob("*.py")):
        rel = f.relative_to(pasta).as_posix()
        if "anexos" in rel.split("/")[:1]:
            continue
        partes = rel[:-3].split("/")
        if len(partes) > MAX_FUNDO - 1 or not all(NOME_OK.match(p) and not p.startswith("__") or p == "__init__" for p in partes):
            recusados.append(rel)
            continue
        arqs[rel] = f.read_text(encoding="utf-8", errors="replace")[:ARQ_MAX]
    mudados = {r: c for r, c in arqs.items() if antes.get(r) != c}
    sintaxe = {}
    for r, c in mudados.items():
        try:
            compile(c, r, "exec")
        except SyntaxError as e:
            sintaxe[r] = lingua.tr("script.ia_sintaxe", msg=e.msg, linha=e.lineno)
    return {"tipo": "script", "script": caminho(nome), "arquivos_antes": {r: antes.get(r, "") for r in mudados},
            "arquivos": mudados, "novos": sorted(r for r in mudados if r not in antes), "sintaxe": sintaxe,
            "recusados": recusados, "mudou": bool(mudados)}


def aplica(nome, prop, recusados=()):
    """Grava nos seus scripts os arquivos da proposta (a guardada no servidor, nunca a da página), só dentro do projeto.
    recusados: os caminhos (da proposta) que a pessoa recusou no Revisar, que ficam como estão."""
    _base, _rel, topo = projeto(nome)
    feitos, fora = [], set(str(x) for x in (recusados or []))
    for r, cod in (prop or {}).get("arquivos", {}).items():
        if r in fora:
            continue
        alvo = caminho((f"{topo}/" if topo else "") + r)   # confere cada parte do nome de novo (sem "..", sem espaço)
        f = pasta_scripts() / f"{alvo}.py"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(cod, encoding="utf-8")
        feitos.append(alvo)
    return {"ok": True, "arquivos": feitos}


def _relativo(arq_py):
    """("meus" | "exemplos", caminho) de um .py dentro dos seus scripts ou dos exemplos; None fora deles."""
    try:
        p = Path(str(arq_py or "")).expanduser().resolve()
    except (OSError, ValueError):
        return None
    if p.suffix != ".py":
        return None
    for grupo in ("meus", "exemplos"):
        try:
            return grupo, p.relative_to(raiz(grupo).resolve()).with_suffix("").as_posix()
        except ValueError:
            continue
    return None


MARCA_VEZ = ".maisim_vez"                     # o arquivo que o maisim.scope grava na pasta da rodada (a execução que a gravou)


def _da_vez(pasta, vez):
    try:
        return (pasta / MARCA_VEZ).read_text().strip() == vez
    except OSError:
        return False


def arquivo_layout(arq_py):
    """Onde fica o layout de painéis de um script (paineis= no maisim.scope, ou o "Layout ▾" do Scope): sempre nos seus
    scripts, na pasta oculta .layouts (também para um exemplo: a pasta dos exemplos é do MaiSim, só para ler)."""
    grupo, rel = _relativo(arq_py) or ("meus", Path(str(arq_py)).stem)
    return pasta_scripts() / ".layouts" / f"{'exemplos__' if grupo == 'exemplos' else ''}{rel.replace('/', '__')}.scope.json"


def eh_script(modelo):
    """O meta.modelo de uma rodada aponta para um script do MaiSim (seus ou exemplo)?"""
    return _relativo(modelo) is not None
