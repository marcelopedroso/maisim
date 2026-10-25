"""Levar um circuito para outro MaiSim (Marcelo, 24/10: "exportar com tudo de que ele depende, escolher quais resultados vão
junto; importar em outro MaiSim, no Windows, no WSL ou no Linux, e já rodar"). O .msd (MaiSim data), versão 1, é um zip:

  manifest.json                      formato, versão, quem/quando/de que MaiSim, o circuito, cada arquivo (caminho com "/",
                                     tamanho, SHA-256) e as rodadas (pasta, nome, data, guardada)
  circuito/<nome>.ipes               o circuito (os subcircuitos vão embutidos nele)
  circuito/<nome>.controle.json      o controle, com todos os .py dentro (se houver)
  circuito/<nome>.aparencia.json     as cores e as pontas (se houver)
  circuito/<nome>.scope.json         o layout padrão do scope (se houver)
  rodadas/<pasta da rodada>/…        as rodadas escolhidas, cada uma inteira

O caminho da máquina de origem não vai: o meta.modelo/chave_layout do .npz e o "- modelo:" do resumo.md viram <nome>.ipes;
na importação, o caminho novo (as rodadas aparecem ligadas ao circuito). Ficam de fora as conversas da IA, as mensagens
vistas e o layout do scope guardado no navegador (pessoais ou presos ao caminho).

Funções puras (sem o servidor): monta → bytes; le (confere tudo: caminhos, extensões, limites, SHA-256, versão) → o
manifest; instala (grava numa pasta temporária e só então move, os.replace). Nada do que vem é executado."""
import getpass
import hashlib
import io
import json
import os
import platform
import re
import shutil
import sys
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath

for _p in (Path(__file__).resolve().parents[1] / "config", Path(__file__).resolve().parent):   # lingua e textos (o servidor já os põe)
    if str(_p) not in sys.path:
        sys.path.append(str(_p))
import lingua  # noqa: E402
import textos  # noqa: E402,F401

FORMATO = "maisim-msd"
VERSAO = 1
MAX_ARQS = 5000                      # arquivos num .msd
MAX_BYTES = 2**30                    # descompactado (as rodadas: .npz e séries grandes)
NOME = re.compile(r"^[A-Za-z0-9_\-]{1,60}$")              # o nome de um circuito (o mesmo do Salvar)
PASTA = re.compile(r"^[A-Za-z0-9_\-][A-Za-z0-9_.\-]{0,119}$")   # a pasta de uma rodada
IRMAOS = (".controle.json", ".aparencia.json", ".scope.json")   # o que acompanha o .ipes (pelo nome do circuito)
EXT = {".ipes", ".json", ".npz", ".md", ".csv", ".py", ".log", ".txt"}
SOLTOS = {".guardada"}               # sem extensão, numa rodada
# um arquivo de fora do .ipes: no GeckoFileManager, um guardado como EXTERNAL; num bloco, useExternal true
GESTOR = re.compile(r"<GeckoFileManager>(.*?)<\\GeckoFileManager>", re.S)
USA_FORA = re.compile(r"(?m)^useExternal\s+true\s*$")


def versao_maisim():
    try:
        return (Path(__file__).resolve().parents[1] / "VERSION").read_text().strip()
    except OSError:
        return "?"


def _sha(b):
    return hashlib.sha256(b).hexdigest()


def _neutro(nome):
    return f"{nome}.ipes"            # o circuito no meta e no resumo do pacote (sem a pasta da máquina de origem)


def _muda_npz(dados, modelo):
    """O .npz com meta.modelo e chave_layout trocados (os vetores como estão)."""
    import numpy as np                   # só aqui: monta/le/instala sem rodadas não precisam do NumPy
    with np.load(io.BytesIO(dados), allow_pickle=False) as d:
        arrs = {k: d[k] for k in d.files}
    meta = json.loads(str(arrs.pop("meta"))) if "meta" in arrs else {}
    meta["modelo"] = meta["chave_layout"] = modelo
    out = io.BytesIO()
    np.savez_compressed(out, meta=np.array(json.dumps(meta, ensure_ascii=False)), **arrs)
    return out.getvalue()


def _muda_resumo(dados, modelo):
    txt = dados.decode("utf-8", errors="replace")
    return re.sub(r"(?m)^- modelo: .*$", lambda m: f"- modelo: {modelo}", txt, count=1).encode("utf-8")


def _le_meta_npz(f):
    try:
        import numpy as np
        with np.load(f, allow_pickle=False) as d:
            return json.loads(str(d["meta"])) if "meta" in d.files else {}
    except Exception:
        return {}


def monta(nome, ipes, irmaos=None, rodadas=(), autor=None, destino=None):
    """O .msd de um circuito. nome: o do circuito; ipes: o .ipes (bytes); irmaos: {".controle.json": bytes, …} (os que
    existem); rodadas: as pastas das rodadas escolhidas (Path). Sem destino, devolve (bytes, avisos); com destino (um
    arquivo binário aberto), grava nele e devolve (None, avisos). Em fluxo: o tamanho é conferido pelo disco antes de ler,
    e as rodadas são lidas uma de cada vez direto para o zip (um .npz grande não fica duas vezes na memória)."""
    if not NOME.match(nome):
        raise ValueError(lingua.tr("msd.nome_invalido", nome=nome))
    avisos, lista_r = [], []
    try:
        import gzip
        txt = gzip.decompress(ipes).decode("utf-8", errors="replace")
    except OSError:
        txt = ipes.decode("utf-8", errors="replace")
    if USA_FORA.search(txt) or any("EXTERNAL" in m.group(1) for m in GESTOR.finditer(txt)):
        avisos.append(lingua.tr("msd.aviso_externo"))
    # o que vai: (caminho no .msd, bytes já na mão | Path a ler na hora, data)
    itens = [(f"circuito/{nome}.ipes", ipes, time.time())]
    itens += [(f"circuito/{nome}{suf}", b, time.time()) for suf, b in (irmaos or {}).items() if suf in IRMAOS and b is not None]
    for d in rodadas:
        d = Path(d)
        if not d.is_dir() or not PASTA.match(d.name):
            raise ValueError(lingua.tr("msd.rodada_invalida", pasta=d.name))
        npz = next(iter(sorted(d.glob("scope_*.npz"))), None)
        meta = _le_meta_npz(npz) if npz else {}
        tam = 0
        for f in sorted(d.rglob("*")):
            if not f.is_file() or (f.suffix.lower() not in EXT and f.name not in SOLTOS):
                continue                 # o que o MaiSim não conhece não vai (e o importador o recusaria)
            st = f.stat()
            itens.append((f"rodadas/{d.name}/{f.relative_to(d).as_posix()}", f, st.st_mtime))
            tam += st.st_size
        lista_r.append({"pasta": d.name, "nome": str(meta.get("rotulo") or d.name),
                        "data": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime((npz or d).stat().st_mtime)),
                        "guardada": (d / ".guardada").exists(), "tamanho": tam})
    total = sum(len(x) if isinstance(x, bytes) else x.stat().st_size for _, x, _ in itens)
    if len(itens) > MAX_ARQS or total > MAX_BYTES:       # antes de ler qualquer rodada
        raise ValueError(lingua.tr("msd.grande", mb=MAX_BYTES // 2**20, max=MAX_ARQS))
    if autor is None:
        try:
            autor = getpass.getuser()
        except Exception:
            autor = ""
    neutro, lista = _neutro(nome), []
    saida = destino if destino is not None else io.BytesIO()
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for k, x, data in itens:
            b = x if isinstance(x, bytes) else x.read_bytes()
            if k.startswith("rodadas/"):
                if k.endswith(".npz") and k.rsplit("/", 1)[1].startswith("scope_"):
                    b = _muda_npz(b, neutro)
                elif k.count("/") == 2 and k.endswith("/resumo.md"):
                    b = _muda_resumo(b, neutro)
            lista.append({"caminho": k, "tamanho": len(b), "sha256": _sha(b)})
            # o .npz já vem comprimido: guardado sem comprimir de novo (rápido e do mesmo tamanho)
            # a data de cada arquivo (a de origem, nas rodadas: a lista delas ordena por ela)
            i = zipfile.ZipInfo(k, time.localtime(max(data, 315532800))[:6])
            i.compress_type = zipfile.ZIP_STORED if k.endswith(".npz") else zipfile.ZIP_DEFLATED
            z.writestr(i, b)
            del b
        man = {"formato": FORMATO, "versao": VERSAO, "maisim": versao_maisim(), "criado": time.strftime("%Y-%m-%dT%H:%M:%S"),
               "autor": autor, "sistema": platform.system(), "circuito": nome, "avisos": avisos, "arquivos": lista,
               "rodadas": lista_r}
        z.writestr("manifest.json", json.dumps(man, ensure_ascii=False, indent=1))   # por último: já com os SHA-256
    return (None if destino is not None else saida.getvalue()), avisos


def _caminho_ok(nome):
    """Um caminho de dentro do .msd que pode ser gravado: relativo, com "/", sem "..", sem unidade (C:), sem pasta oculta."""
    if not nome or "\\" in nome or ":" in nome or nome.startswith("/") or "\x00" in nome:
        return False
    p = PurePosixPath(nome)
    return not p.is_absolute() and all(x not in ("", ".", "..") for x in p.parts)


def le(arquivo):
    """Abre e confere um .msd (arquivo: caminho ou bytes). Confere tudo antes de qualquer gravação: zip válido, o manifest
    (formato e versão; uma versão mais nova é recusada), até MAX_ARQS arquivos e MAX_BYTES descompactados, caminhos (sem
    "..", sem absoluto, sem "\\"), só as extensões conhecidas, a lista do manifest igual à do zip e o SHA-256 de cada um.
    Devolve o manifest (com "circuito", "rodadas", "avisos"…)."""
    try:
        z = zipfile.ZipFile(io.BytesIO(arquivo) if isinstance(arquivo, (bytes, bytearray)) else arquivo)
    except (zipfile.BadZipFile, OSError):
        raise ValueError(lingua.tr("msd.zip_invalido"))
    with z:
        infos = [i for i in z.infolist() if not i.is_dir()]
        if len(infos) > MAX_ARQS + 1:
            raise ValueError(lingua.tr("msd.grande", mb=MAX_BYTES // 2**20, max=MAX_ARQS))
        if sum(i.file_size for i in infos) > MAX_BYTES:
            raise ValueError(lingua.tr("msd.grande", mb=MAX_BYTES // 2**20, max=MAX_ARQS))
        nomes = {}
        for i in infos:
            if not _caminho_ok(i.filename) or i.filename in nomes:
                raise ValueError(lingua.tr("msd.caminho_invalido", arq=i.filename))
            nomes[i.filename] = i
        if "manifest.json" not in nomes or nomes["manifest.json"].file_size > 2**22:
            raise ValueError(lingua.tr("msd.sem_manifest"))
        try:
            man = json.loads(z.read("manifest.json"))
            assert isinstance(man, dict)
        except (ValueError, AssertionError):
            raise ValueError(lingua.tr("msd.sem_manifest"))
        if man.get("formato") != FORMATO:
            raise ValueError(lingua.tr("msd.sem_manifest"))
        v = man.get("versao")
        if not isinstance(v, int) or v < 1:
            raise ValueError(lingua.tr("msd.sem_manifest"))
        if v > VERSAO:
            raise ValueError(lingua.tr("msd.versao_nova", v=v, maisim=man.get("maisim", "?"), nosso=VERSAO))
        nome = man.get("circuito")
        if not isinstance(nome, str) or not NOME.match(nome):
            raise ValueError(lingua.tr("msd.nome_invalido", nome=str(nome)))
        lista = man.get("arquivos")
        if not isinstance(lista, list) or not all(isinstance(a, dict) and isinstance(a.get("caminho"), str) and isinstance(a.get("sha256"), str)
                                                   and isinstance(a.get("tamanho"), int) for a in lista):
            raise ValueError(lingua.tr("msd.sem_manifest"))
        esperados = {a["caminho"]: a for a in lista}
        if set(esperados) != set(nomes) - {"manifest.json"} or len(esperados) != len(lista):
            raise ValueError(lingua.tr("msd.lista_difere"))
        pastas = set()
        for c in esperados:
            p = PurePosixPath(c)
            if p.parts[0] == "circuito" and len(p.parts) == 2 and p.name in [f"{nome}.ipes", *(nome + s for s in IRMAOS)]:
                continue
            if p.parts[0] == "rodadas" and len(p.parts) >= 3 and PASTA.match(p.parts[1]) \
                    and (p.suffix.lower() in EXT or (len(p.parts) == 3 and p.name in SOLTOS)):
                pastas.add(p.parts[1])
                continue
            raise ValueError(lingua.tr("msd.caminho_invalido", arq=c))
        if f"circuito/{nome}.ipes" not in esperados:
            raise ValueError(lingua.tr("msd.sem_circuito"))
        for c, a in esperados.items():               # o SHA-256 de cada um (lido aos pedaços: não guarda nada na memória)
            h, n = hashlib.sha256(), 0
            with z.open(nomes[c]) as f:
                for bloco in iter(lambda: f.read(1 << 20), b""):
                    h.update(bloco); n += len(bloco)
                    if n > a["tamanho"]:
                        break
            if n != a["tamanho"] or h.hexdigest() != a["sha256"]:
                raise ValueError(lingua.tr("msd.sha_difere", arq=c))
    rods = [r for r in man.get("rodadas") or [] if isinstance(r, dict) and r.get("pasta") in pastas]
    for p in sorted(pastas - {r["pasta"] for r in rods}):       # uma pasta sem a linha no manifest: entra com o nome dela
        rods.append({"pasta": p, "nome": p})
    man["rodadas"] = [{"pasta": r["pasta"], "nome": str(r.get("nome") or r["pasta"])[:200], "data": str(r.get("data") or "")[:40],
                       "guardada": bool(r.get("guardada")), "tamanho": sum(a["tamanho"] for c, a in esperados.items() if c.startswith(f"rodadas/{r['pasta']}/"))}
                      for r in rods]
    man["irmaos"] = [s for s in IRMAOS if f"circuito/{nome}{s}" in esperados]
    man["tamanho"] = sum(a["tamanho"] for a in esperados.values())
    man["avisos"] = [str(x)[:300] for x in man.get("avisos") or [] if isinstance(x, str)][:10]
    for k in ("autor", "sistema", "maisim", "criado"):
        man[k] = str(man.get(k) or "")[:80]
    return man


def ocupado(salvos, nome):
    """Já há um circuito (ou um arquivo dele, como um controle que ficou) com esse nome em salvos?"""
    return any((Path(salvos) / f"{nome}{s}").exists() for s in (".ipes", *IRMAOS, ".cores.json"))


def livre(salvos, nome):
    """O nome livre: nome, ou nome_2, nome_3… (cortado para caber nos 60 caracteres)."""
    if not ocupado(salvos, nome):
        return nome
    k = 2
    while ocupado(salvos, f"{nome[:60 - len(str(k)) - 1]}_{k}"):
        k += 1
    return f"{nome[:60 - len(str(k)) - 1]}_{k}"


def _pasta_livre(rodadas, pasta, reservadas):
    if not (Path(rodadas) / pasta).exists() and pasta not in reservadas:
        return pasta
    k = 2
    while (Path(rodadas) / f"{pasta}_{k}").exists() or f"{pasta}_{k}" in reservadas:
        k += 1
    return f"{pasta}_{k}"


def instala(arquivo, salvos, rodadas_dir, nome=None, rodadas=None, substituir=False, modelo_de=None):
    """Grava um .msd (já conferido por le; confere de novo). salvos: a pasta dos circuitos; rodadas_dir: a das rodadas; nome:
    o nome novo do circuito (padrão: o do pacote); rodadas: as pastas escolhidas (None: todas); substituir: por cima de um
    circuito com esse nome (senão, recusado); modelo_de(Path) → o caminho do circuito como o meta/resumo o guardam (o
    relativo() do servidor). Tudo numa pasta temporária primeiro; só depois os.replace. Devolve {ipes, nome, rodadas}."""
    man = le(arquivo)
    nome = nome or man["circuito"]
    if not NOME.match(nome):
        raise ValueError(lingua.tr("msd.nome_invalido", nome=nome))
    salvos, rodadas_dir = Path(salvos), Path(rodadas_dir)
    if ocupado(salvos, nome) and not substituir:
        raise ValueError(lingua.tr("msd.ja_existe", nome=nome))
    escolhidas = [r["pasta"] for r in man["rodadas"] if rodadas is None or r["pasta"] in set(rodadas)]
    dest = salvos / f"{nome}.ipes"
    modelo = (modelo_de or (lambda p: Path(p).as_posix()))(dest)
    salvos.mkdir(parents=True, exist_ok=True)
    rodadas_dir.mkdir(parents=True, exist_ok=True)
    tmp_c, tmp_r = salvos / f".msd_{uuid.uuid4().hex}", rodadas_dir / f".msd_{uuid.uuid4().hex}"
    destinos, reservadas = {}, set()
    for p in escolhidas:
        destinos[p] = _pasta_livre(rodadas_dir, p, reservadas)
        reservadas.add(destinos[p])
    esperados = {a["caminho"]: a for a in man["arquivos"]}
    try:
        with zipfile.ZipFile(io.BytesIO(arquivo) if isinstance(arquivo, (bytes, bytearray)) else arquivo) as z:
            for c, a in esperados.items():
                p = PurePosixPath(c)
                if p.parts[0] == "circuito":
                    alvo = tmp_c / (nome + p.name[len(man["circuito"]):])
                elif p.parts[1] in destinos:
                    alvo = tmp_r / destinos[p.parts[1]] / Path(*p.parts[2:])
                else:
                    continue
                b = z.read(c)
                if _sha(b) != a["sha256"]:
                    raise ValueError(lingua.tr("msd.sha_difere", arq=c))
                if p.parts[0] == "rodadas" and p.name.startswith("scope_") and p.suffix == ".npz" and len(p.parts) == 3:
                    b = _muda_npz(b, modelo)
                elif p.parts[0] == "rodadas" and len(p.parts) == 3 and p.name == "resumo.md":
                    b = _muda_resumo(b, modelo)
                alvo.parent.mkdir(parents=True, exist_ok=True)
                alvo.write_bytes(b)
                try:                             # a data de cada arquivo, a de origem (a lista das rodadas ordena por ela)
                    t = time.mktime(z.getinfo(c).date_time + (0, 0, -1))
                    os.utime(alvo, (t, t))
                except (OverflowError, ValueError, OSError):
                    pass
        # tudo conferido e escrito: agora os os.replace (no substituir, os irmãos antigos que o pacote não traz saem)
        if substituir:
            for s in (*IRMAOS, ".cores.json"):
                f = salvos / f"{nome}{s}"
                if f.exists() and not (tmp_c / f.name).exists():
                    f.unlink()
        for f in sorted(tmp_c.iterdir(), key=lambda f: f.suffix == ".ipes"):   # o .ipes por último: o circuito aparece já completo
            os.replace(f, salvos / f.name)
        feitas = []
        for p in escolhidas:
            os.replace(tmp_r / destinos[p], rodadas_dir / destinos[p])
            feitas.append(destinos[p])
        return {"ipes": dest, "nome": nome, "rodadas": feitas}
    finally:
        shutil.rmtree(tmp_c, ignore_errors=True)
        shutil.rmtree(tmp_r, ignore_errors=True)
