"""Os contextos salvos do MaiSim (Marcelo, 21/10: "um resultado muito bom… não podemos perder: um botãozinho para salvar isso
na memória não volátil, até para usar em outras conversas", e depois em outras IAs e com o time de pesquisa).

Um contexto é uma pasta em MAISIM_CONTEXTOS (padrão ~/.local/share/maisim/contextos — dados do MaiSim, fora do repositório e do
cache), uma por contexto:
  meta.json     versão do formato, título, etiquetas, circuito, quando, IA, modelo, autor, a conversa de origem, o que tem
  contexto.md   o título e a nota de quem salvou (o que achou importante lembrar; resumo.md guarda o texto da nota)
  conversa.md   a conversa (pedido e resposta, com o modelo e o gasto), tirada do histórico do MaiSim
  controle/     o controle daquele momento (controle.json e os .py), como em rodadas/<rodada>/
  rodada/       resumo.md e serie/ da rodada mais nova (os "olhos")
  anexos/       os anexos da conversa (opcional)
Usar num pedido: o contexto é copiado para a pasta da conversa, em contextos/<id>/, e o pedido diz para ler o contexto.md.
Exportar/importar: um .maisimctx (zip da pasta); nada do que vem é executado (o controle só entra se aplicado como proposta).
"""
import io
import json
import os
import re
import shutil
import subprocess
import time
import uuid
import zipfile
from pathlib import Path

VERSAO = 1
ID = re.compile(r"[\w][\w.\-]{0,95}")
MAX_ARQS = 500                       # arquivos num .maisimctx
MAX_BYTES = 80 * 2**20               # o .maisimctx descompactado
MAX_TEXTO = 400_000                  # resumo, título e etiquetas


def pasta_padrao():
    return Path(os.environ.get("MAISIM_CONTEXTOS") or Path(os.environ.get("MAISIM_DADOS") or Path.home() / ".local" / "share" / "maisim") / "contextos")


def slug(t):
    s = re.sub(r"[^\w\-]+", "_", str(t), flags=re.ASCII).strip("_").lower()
    return s[:48] or "contexto"


def autor():
    """Quem salva: o nome do git (o mesmo dos commits), senão o usuário da máquina."""
    try:
        r = subprocess.run(["git", "config", "user.name"], capture_output=True, text=True, timeout=3)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return os.environ.get("USER", "")


def _confere_id(cid):
    if not ID.fullmatch(str(cid or "")) or ".." in str(cid):
        raise ValueError(f"contexto inválido: {cid!r}")
    return str(cid)


def _tamanho(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def _le_meta(d):
    try:
        m = json.loads((d / "meta.json").read_text())
        return m if isinstance(m, dict) else None
    except (OSError, ValueError):
        return None


def _grava_meta(d, m):
    """Grava o meta.json de uma vez (arquivo ao lado + troca): quem lê no meio (a página, a cada segundo) nunca o vê vazio."""
    tmp = d / f".meta_{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, d / "meta.json")


def lista(base):
    """Os contextos salvos, o mais novo primeiro: meta + id, tamanho e o que tem."""
    out = []
    if base.is_dir():
        for d in base.iterdir():
            if not d.is_dir() or d.name.startswith("."):
                continue
            m = _le_meta(d)
            if m is None:
                continue
            m.update(id=d.name, tamanho=_tamanho(d),
                     tem={k: (d / k).exists() for k in ("conversa.md", "controle", "rodada", "anexos")})
            out.append(m)
    return sorted(out, key=lambda m: str(m.get("quando", "")), reverse=True)


def meta(base, cid):
    """Só o meta.json (leve: a página pergunta a cada segundo); None se não há."""
    try:
        return _le_meta(base / _confere_id(cid))
    except ValueError:
        return None


def le(base, cid):
    d = base / _confere_id(cid)
    m = _le_meta(d)
    if m is None:
        raise FileNotFoundError(f"não há o contexto {cid}")
    txt = lambda n: (d / n).read_text(errors="replace") if (d / n).is_file() else ""
    return dict(meta=dict(m, id=cid), contexto=txt("contexto.md"), conversa=txt("conversa.md"), resumo=txt("resumo.md"), resumo_ia=txt("resumo_ia.md"),
                arquivos=[{"nome": str(f.relative_to(d)), "tamanho": f.stat().st_size} for f in sorted(d.rglob("*")) if f.is_file()])


def contexto_md(meta, resumo, resumo_ia=""):
    linhas = [f"# {meta['titulo']}", ""]
    linhas += [f"- {k}: {v}" for k, v in (("circuito", meta.get("circuito")), ("quando", meta.get("quando")),
                                          ("IA", " · ".join(x for x in (meta.get("ia"), meta.get("modelo")) if x)),
                                          ("autor", meta.get("autor")), ("etiquetas", ", ".join(meta.get("etiquetas") or [])))
               if v]
    tem = meta.get("tem") or {}
    linhas += ["", resumo.strip() or "(sem nota: veja a conversa)", ""]
    if resumo_ia.strip():                     # o resumo pela IA (feito depois de salvar, a partir da conversa guardada)
        corpo = re.sub(r"(?m)^(#{1,5}) ", r"#\1 ", resumo_ia.strip())      # as seções dele ficam um nível abaixo
        linhas += ["## Resumo pela IA" + (f" ({meta['resumo_ia'].get('modelo')})" if (meta.get("resumo_ia") or {}).get("modelo") else ""), "", corpo, ""]
    linhas += ["## Arquivos deste contexto", ""]
    if tem.get("conversa.md"):
        linhas.append("- conversa.md: a conversa inteira (pedido e resposta)")
    if tem.get("controle"):
        linhas.append("- controle/: o controle daquele momento (controle.json e os .py) — referência; o controle em uso é o da pasta da conversa")
    if tem.get("rodada"):
        linhas.append("- rodada/: o resumo (resumo.md) e as séries (serie/<canal>.csv) da rodada mais nova daquele momento")
    if tem.get("anexos"):
        linhas.append("- anexos/: os anexos da conversa")
    return "\n".join(linhas) + "\n"


def conversa_md(hist, titulo=""):
    """A conversa do histórico do MaiSim em markdown: cada pedido, quem respondeu e a resposta (ou o erro)."""
    L = [f"# Conversa{f' — {titulo}' if titulo else ''}", ""]
    for k, h in enumerate(hist or [], 1):
        quando = time.strftime("%d/%m/%Y %H:%M", time.localtime(h["quando"])) if isinstance(h.get("quando"), (int, float)) else ""
        L += [f"## {k}. Pedido{f' ({quando})' if quando else ''}", "", str(h.get("pedido") or "").strip(), ""]
        if h.get("anexos"):
            L += [f"Anexos: {', '.join(h['anexos'])}", ""]
        g = h.get("gasto") or {}
        info = " · ".join(x for x in (h.get("ia") or "", h.get("modelo") or "",
                                       f"{g['segundos']:.0f} s" if isinstance(g.get("segundos"), (int, float)) else "",
                                       "aplicada" if h.get("aplicada") else "", "desfeita" if h.get("desfeita") else "") if x)
        L += [f"### Resposta{f' ({info})' if info else ''}", ""]
        corpo = h.get("resposta") or h.get("fala") or ""
        L += [str(corpo).strip() or "(sem resposta)", ""]
        if h.get("erro"):
            L += [f"Erro: {h['erro']}", ""]
    return "\n".join(L) + "\n"


def _escreve_controle(destino, c):
    destino.mkdir(parents=True, exist_ok=True)
    arquivos = {"controle.py": c.get("codigo") or "", **{k: v for k, v in (c.get("arquivos") or {}).items() if k != "controle.py"}}
    for nome, cod in arquivos.items():
        if re.fullmatch(r"[\w\-]+\.py", nome):
            (destino / nome).write_text(cod)
    (destino / "controle.json").write_text(json.dumps({k: v for k, v in c.items() if k != "codigo"}, ensure_ascii=False, indent=1) + "\n")


def salva(base, titulo, resumo, etiquetas=(), conversa=None, controle=None, rodada=None, anexos=None, extra=None):
    """Grava um contexto novo (numa pasta temporária, depois o nome final) e devolve o id. conversa: o texto de
    conversa.md; controle: o dict do controle; rodada: a pasta da rodada (resumo.md, serie/); anexos: a pasta dos anexos."""
    titulo = str(titulo or "").strip()[:200] or "contexto"
    resumo = str(resumo or "")[:MAX_TEXTO]
    etiquetas = [str(e).strip()[:40] for e in etiquetas or [] if str(e).strip()][:20]
    base.mkdir(parents=True, exist_ok=True)
    tmp = base / f".tmp_{uuid.uuid4().hex}"
    tmp.mkdir()
    try:
        tem = {}
        if conversa:
            (tmp / "conversa.md").write_text(conversa)
            tem["conversa.md"] = True
        if controle:
            _escreve_controle(tmp / "controle", controle)
            tem["controle"] = True
        if rodada and (Path(rodada) / "resumo.md").is_file():
            (tmp / "rodada").mkdir()
            shutil.copyfile(Path(rodada) / "resumo.md", tmp / "rodada" / "resumo.md")
            if (Path(rodada) / "serie").is_dir():
                shutil.copytree(Path(rodada) / "serie", tmp / "rodada" / "serie")
            tem["rodada"] = True
            tem["rodada_nome"] = Path(rodada).name
        if anexos and Path(anexos).is_dir() and any(f.is_file() for f in Path(anexos).iterdir()):
            shutil.copytree(anexos, tmp / "anexos", ignore=lambda d, fs: [f for f in fs if not (Path(d) / f).is_file()])
            tem["anexos"] = True
        meta = dict(versao=VERSAO, titulo=titulo, etiquetas=etiquetas, quando=time.strftime("%Y-%m-%d %H:%M"), autor=autor(),
                    **(extra or {}), tem=tem)
        (tmp / "contexto.md").write_text(contexto_md(meta, resumo))
        (tmp / "resumo.md").write_text(resumo)
        (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
        cid = _livre(base, f"{time.strftime('%Y-%m-%d_%H%M')}_{slug(titulo)}")
        os.replace(tmp, base / cid)
        return cid
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def _livre(base, cid):
    k, out = 1, cid
    while (base / out).exists():
        k += 1
        out = f"{cid}_{k}"
    return out


def _ia(d):
    return (d / "resumo_ia.md").read_text() if (d / "resumo_ia.md").is_file() else ""


def poe_resumo_ia(base, cid, estado, texto=None, erro=None, modelo=None):
    """O estado do resumo pela IA no meta (gerando | pronto | falhou) e, pronto, o texto em resumo_ia.md e no contexto.md."""
    d = base / _confere_id(cid)
    m = _le_meta(d)
    if m is None:
        raise FileNotFoundError(f"não há o contexto {cid}")
    m["resumo_ia"] = {k: v for k, v in dict(estado=estado, quando=time.strftime("%Y-%m-%d %H:%M"), erro=erro, modelo=modelo).items() if v}
    if texto is not None:
        (d / "resumo_ia.md").write_text(texto)
    res = (d / "resumo.md").read_text() if (d / "resumo.md").is_file() else ""
    (d / "contexto.md").write_text(contexto_md(m, res, _ia(d)))
    _grava_meta(d, m)
    return m


def muda(base, cid, titulo=None, etiquetas=None, resumo=None):
    """Renomear (o título), etiquetar, ou trocar o resumo (o contexto.md é refeito)."""
    d = base / _confere_id(cid)
    m = _le_meta(d)
    if m is None:
        raise FileNotFoundError(f"não há o contexto {cid}")
    if titulo is not None:
        m["titulo"] = str(titulo).strip()[:200] or m["titulo"]
    if etiquetas is not None:
        m["etiquetas"] = [str(e).strip()[:40] for e in etiquetas if str(e).strip()][:20]
    res = (d / "resumo.md").read_text() if (d / "resumo.md").is_file() else ""
    if resumo is not None:
        res = str(resumo)[:MAX_TEXTO]
        (d / "resumo.md").write_text(res)
    (d / "contexto.md").write_text(contexto_md(m, res, _ia(d)))
    _grava_meta(d, m)
    return dict(m, id=cid)


def apaga(base, cid):
    d = base / _confere_id(cid)
    if not (d / "meta.json").is_file():
        raise FileNotFoundError(f"não há o contexto {cid}")
    shutil.rmtree(d)


def exporta(base, cid, anexos=True):
    """O .maisimctx: o zip da pasta do contexto (sem os anexos, se pedido)."""
    d = base / _confere_id(cid)
    if not (d / "meta.json").is_file():
        raise FileNotFoundError(f"não há o contexto {cid}")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(d.rglob("*")):
            rel = f.relative_to(d)
            if f.is_file() and (anexos or rel.parts[0] != "anexos"):
                z.write(f, f"{cid}/{rel.as_posix()}")
    return buf.getvalue()


def importa(base, dados, nome=""):
    """Põe um .maisimctx na biblioteca (com um id novo se já houver um igual). Confere tudo antes de escrever: uma pasta só,
    sem caminho absoluto nem "..", até MAX_ARQS arquivos e MAX_BYTES descompactados, meta.json válido e contexto.md."""
    try:
        z = zipfile.ZipFile(io.BytesIO(dados))
    except zipfile.BadZipFile:
        raise ValueError("não é um .maisimctx (zip) válido")
    infos = [i for i in z.infolist() if not i.is_dir()]
    if not infos or len(infos) > MAX_ARQS:
        raise ValueError(f"o .maisimctx tem {len(infos)} arquivos (até {MAX_ARQS})")
    if sum(i.file_size for i in infos) > MAX_BYTES:
        raise ValueError(f"o .maisimctx passa de {MAX_BYTES // 2**20} MB descompactado")
    topos = set()
    for i in infos:
        p = Path(i.filename)
        if p.is_absolute() or ".." in p.parts or not p.parts or "\\" in i.filename:
            raise ValueError(f"caminho inválido no .maisimctx: {i.filename}")
        topos.add(p.parts[0])
    if len(topos) != 1:
        raise ValueError("o .maisimctx deve ter uma pasta só (um contexto)")
    topo = topos.pop()
    nomes = {Path(i.filename).relative_to(topo).as_posix(): i for i in infos if len(Path(i.filename).parts) > 1}
    if "meta.json" not in nomes or "contexto.md" not in nomes:
        raise ValueError("o .maisimctx não tem meta.json e contexto.md")
    try:
        meta = json.loads(z.read(nomes["meta.json"]))
        assert isinstance(meta, dict) and isinstance(meta.get("titulo"), str)
    except (ValueError, AssertionError):
        raise ValueError("meta.json inválido no .maisimctx")
    base.mkdir(parents=True, exist_ok=True)
    tmp = base / f".tmp_{uuid.uuid4().hex}"
    try:
        for rel, i in nomes.items():
            alvo = tmp / rel
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_bytes(z.read(i))
        meta["importado"] = {"quando": time.strftime("%Y-%m-%d %H:%M"), "arquivo": Path(str(nome)).name, "autor_original": meta.get("autor", "")}
        (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
        cid = _livre(base, slug(topo) if ID.fullmatch(topo) else f"{time.strftime('%Y-%m-%d_%H%M')}_{slug(meta['titulo'])}")
        os.replace(tmp, base / cid)
        return cid
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def poe_na_conversa(base, ids, pasta_conversa):
    """A pasta da conversa fica com exatamente estes contextos em contextos/<id>/ (cópia feita a cada pedido: um contexto
    renomeado, mudado ou apagado na biblioteca acompanha). Devolve os que existem: [{id, titulo}]."""
    destino = pasta_conversa / "contextos"
    ok = []
    if destino.is_dir():
        for d in destino.iterdir():
            if d.name not in ids:
                shutil.rmtree(d, ignore_errors=True) if d.is_dir() else d.unlink()
    for cid in ids:
        try:
            d = base / _confere_id(cid)
        except ValueError:
            continue
        m = _le_meta(d)
        if m is None:
            continue
        alvo = destino / cid
        shutil.rmtree(alvo, ignore_errors=True)
        shutil.copytree(d, alvo)
        ok.append({"id": cid, "titulo": m.get("titulo", cid)})
    return ok
