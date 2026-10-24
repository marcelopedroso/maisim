"""O resumo de uma rodada, para o Claude do MaiSim ler.

Marcelo, 19/10: o Claude do MaiSim não via o resultado das rodadas — implementou a Etapa 1 da estratégia de controle e
parou pedindo "os números, que só você consegue ler". Agora, ao fim de cada rodada, o MaiSim grava ao lado do .npz:
  resumo.md          por canal: média, mín., máx., pico a pico, eficaz CA e o fasor em f_nom (o parâmetro do
                     controle; 50 Hz sem ele; pico ∠ fase, referência cosseno: x ≈ X cos(ωt + φ)) na última janela (o
                     regime) e a média e o pico a pico em cada janela (a evolução); o estado final, o erro e o fim da saída do controle
  serie/<canal>.csv  a série reduzida (t, valor): a média de cada bloco de amostras (≈ 500 pontos; sem aliasing do
                     chaveamento), para o Claude ler só os canais que quiser
No pedido seguinte (e entre as voltas do modo autônomo), o MaiSim copia os dois para a pasta do Claude como
ULTIMA_RODADA.md e ULTIMA_RODADA/.
"""
import json
import math
import re
import shutil
import sys
from pathlib import Path

import numpy as np

for _p in (Path(__file__).resolve().parents[1] / "config", Path(__file__).resolve().parent):   # lingua e textos (o servidor já os põe)
    if str(_p) not in sys.path:
        sys.path.append(str(_p))
import lingua  # noqa: E402                    o resumo no idioma de quem rodou (a linha "- modelo: …" é do protocolo: não muda)
import textos  # noqa: E402,F401

ESTADOS = ("preparando", "rodando", "pausada", "parada", "fim", "erro")   # os da rodada (servidor.py)


def estado_txt(est):
    """O estado da rodada para ler: em português a palavra do protocolo (como antes); em inglês, traduzida."""
    return lingua.tr(f"rodada_estado.{est}") if est in ESTADOS else str(est)


JANELAS = 5          # a rodada em 5 janelas iguais: a última é o "regime"
PONTOS = 500         # pontos de cada série reduzida


def _fmt(v):
    if v is None or not math.isfinite(v):
        return "—"
    a = abs(v)
    if a != 0 and (a >= 1e5 or a < 1e-3):
        return f"{v:.3e}"
    return f"{v:.4g}"


def _fasor(t, x, f0):
    """O fasor de f0 (pico, fase em graus, referência cosseno) por mínimos quadrados num número inteiro de ciclos."""
    w = 2 * math.pi * f0
    a, b = 2 * np.mean(x * np.cos(w * t)), 2 * np.mean(x * np.sin(w * t))
    return math.hypot(a, b), math.degrees(math.atan2(-b, a))


def _janelas(t0, t1):
    passo = (t1 - t0) / JANELAS
    return [(t0 + i * passo, t0 + (i + 1) * passo) for i in range(JANELAS)]


def escreve(npz, destino=None, estado=None, saida_controle=""):
    """Grava resumo.md e serie/ em destino (a pasta da rodada). estado: {estado, erro, segundos}."""
    npz = Path(npz)
    destino = Path(destino or npz.parent)
    z = np.load(npz, allow_pickle=True)
    meta = json.loads(str(z["meta"])) if "meta" in z.files else {}
    t = np.asarray(z["t"], dtype=float)
    canais = [k for k in z.files if k not in ("meta", "t")]
    ctl = meta.get("controle") or {}
    f0 = float((ctl.get("parametros") or {}).get("f_nom", 50.0) or 50.0)
    ok_t = np.isfinite(t)
    t0, t1 = (float(t[ok_t][0]), float(t[ok_t][-1])) if ok_t.any() else (0.0, 0.0)
    js = _janelas(t0, t1)
    est = estado or {}
    tr = lingua.tr
    L = [tr("resumo.titulo", rotulo=meta.get('rotulo', npz.stem)), "",
         f"- modelo: {meta.get('modelo', '?')}",         # protocolo: do_modelo() e muda_modelo() leem esta linha
         tr("resumo.estado", estado=estado_txt(est.get('estado', '?')), erro=tr("resumo.erro", erro=est['erro']) if est.get("erro") else "",
            relogio=tr("resumo.relogio", s=est['segundos']) if est.get("segundos") is not None else ""),
         tr("resumo.tempo", t0=_fmt(t0), t1=_fmt(t1), dtg=_fmt(meta.get('dt_gecko')), dt=_fmt(meta.get('dt')),
            ts=_fmt(ctl.get('Ts')) if ctl else tr("resumo.sem_controle"), n=len(canais)),
         tr("resumo.fasores", f=f"{f0:g}"),
         tr("resumo.janelas", lista="; ".join(f"J{i + 1} = [{_fmt(a)}, {_fmt(b)}) s" for i, (a, b) in enumerate(js))), "",
         tr("resumo.regime"), "",
         tr("resumo.tabela", f=f"{f0:g}"), "|---|---|---|---|---|---|---|"]
    evol = []
    (destino / "serie").mkdir(parents=True, exist_ok=True)
    for k in canais:
        x = np.asarray(z[k], dtype=float)
        if x.shape != t.shape:
            continue
        ok = np.isfinite(x) & ok_t
        a, b = js[-1]
        J = ok & (t >= a) & (t <= b)
        if J.sum() >= 2:
            xx, tt = x[J], t[J]
            nc = math.floor((tt[-1] - tt[0]) * f0)
            fas = "—"
            if nc >= 1:
                F = J & (t >= tt[-1] - nc / f0)
                if F.sum() >= 8:
                    mag, fase = _fasor(t[F], x[F], f0)
                    fas = f"{_fmt(mag)} ∠ {fase:.1f}°"
            L.append(f"| {k} | {_fmt(xx.mean())} | {_fmt(xx.min())} | {_fmt(xx.max())} | {_fmt(xx.max() - xx.min())} | {_fmt(xx.std())} | {fas} |")
        else:
            L.append(f"| {k} | — | — | — | — | — | — |")
        medias, pps = [], []
        for a, b in js:
            J = ok & (t >= a) & (t <= b)
            medias.append(_fmt(x[J].mean()) if J.any() else "—")
            pps.append(_fmt(x[J].max() - x[J].min()) if J.any() else "—")
        evol.append(tr("resumo.evolucao_canal", canal=k, medias=' → '.join(medias), pps=' → '.join(pps)))
        # a série reduzida: a média de cada bloco (os blocos vazios ficam de fora)
        nome = re.sub(r"[^\w.\-]", "_", k)
        bl = max(1, math.ceil(len(t) / PONTOS))
        linhas = ["t,valor"]
        for i in range(0, len(t), bl):
            s = ok[i:i + bl]
            if s.any():
                linhas.append(f"{t[i:i + bl][s].mean():.6g},{x[i:i + bl][s].mean():.6g}")
        (destino / "serie" / f"{nome}.csv").write_text("\n".join(linhas) + "\n")
    L += ["", tr("resumo.evolucao"), ""] + evol
    saida = (saida_controle or "").strip()
    if saida:
        L += ["", tr("resumo.saida_controle"), "", "```", saida[-3000:], "```"]
    L += ["", tr("resumo.series", n=max(1, math.ceil(len(t) / PONTOS)))]
    (destino / "resumo.md").write_text("\n".join(L) + "\n")
    return destino / "resumo.md"


def copia_para(pasta_rodada, pasta_claude):
    """A rodada vai para a pasta do Claude como ULTIMA_RODADA.md e ULTIMA_RODADA/ (o que havia antes sai)."""
    pasta_rodada, pasta_claude = Path(pasta_rodada), Path(pasta_claude)
    alvo = pasta_claude / "ULTIMA_RODADA"
    shutil.rmtree(alvo, ignore_errors=True)
    (pasta_claude / "ULTIMA_RODADA.md").unlink(missing_ok=True)
    if not (pasta_rodada / "resumo.md").exists():
        return False
    shutil.copyfile(pasta_rodada / "resumo.md", pasta_claude / "ULTIMA_RODADA.md")
    if (pasta_rodada / "serie").is_dir():
        shutil.copytree(pasta_rodada / "serie", alvo)
    return True


def do_modelo(resumo):
    """O circuito da rodada, como o resumo diz na linha "- modelo: ..." (ou "")."""
    try:
        with open(resumo, encoding="utf-8", errors="replace") as f:
            for _, linha in zip(range(6), f):
                if linha.startswith("- modelo: "):
                    return linha[len("- modelo: "):].strip()
    except OSError:
        pass
    return ""


def muda_modelo(rodadas, de, para, desde=None):
    """Um circuito novo salvo com nome: as rodadas dele (o resumo diz "de", feitas depois de "desde") passam a dizer "para"."""
    if desde is None:
        return
    for p in Path(rodadas).glob("*/resumo.md"):
        try:
            if p.stat().st_mtime < desde or do_modelo(p) != de:
                continue
            txt = p.read_text(encoding="utf-8")
            p.write_text(txt.replace(f"- modelo: {de}\n", f"- modelo: {para}\n", 1), encoding="utf-8")
        except OSError:
            pass


def ultima(rodadas, modelo=None):
    """A pasta da rodada mais nova que tem resumo (ou None); com modelo, só as daquele circuito."""
    pastas = [p for p in Path(rodadas).glob("*/resumo.md") if modelo is None or do_modelo(p) == str(modelo)]
    return max(pastas, key=lambda p: p.stat().st_mtime).parent if pastas else None
