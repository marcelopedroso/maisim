"""O modo script (issue #258): um script Python comum, que roda do começo ao fim, sem circuito e sem o GeckoCIRCUITS, e
manda os resultados para o Scope por `maisim.scope(...)` (simu/script_api/maisim.py).

Tudo fica dentro do MaiSim:
- os scripts em MAISIM_SCRIPTS (padrão MAISIM_DADOS/scripts), um <nome>.py cada; os exemplos em simu/scripts_exemplo/,
  só para ler (abrir um exemplo e salvar faz uma cópia nos seus);
- o script roda num processo à parte, com a pasta dos scripts como pasta de trabalho e prazo (MAISIM_SCRIPT_PRAZO);
- as rodadas que ele grava vão sempre para as rodadas do MaiSim (MAISIM_RODADAS), que o Scope lista.

Organiza onde as coisas ficam, mas não isola o processo: um script Python abre qualquer arquivo que o usuário abre. A página
avisa disso. Só biblioteca padrão aqui (o numpy é do script, não do servidor)."""
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
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


def roda(nome, grupo="meus"):
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
    return {"ok": codigo == 0, "codigo_saida": codigo, "prazo_estourado": estourou, "tempo": round(time.time() - antes, 3),
            "saida": _corta(saida), "erro": _corta(erro), "rodadas": novas}


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
