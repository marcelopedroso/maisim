"""O resumo de uma rodada, para o Claude do PEW ler.

Marcelo, 19/10: o Claude do PEW não via o resultado das rodadas — implementou a Etapa 1 da estratégia de controle e
parou pedindo "os números, que só você consegue ler". Agora, ao fim de cada rodada, o PEW grava ao lado do .npz:
  resumo.md          por canal: média, mín., máx., pico a pico, eficaz CA e o fasor de 50 Hz (pico ∠ fase, referência
                     cosseno: x ≈ X cos(ωt + φ)) na última janela (o regime) e a média e o pico a pico em cada janela
                     (a evolução); o estado final, o erro e o fim da saída do controle
  serie/<canal>.csv  a série reduzida (t, valor): a média de cada bloco de amostras (≈ 500 pontos; sem aliasing do
                     chaveamento), para o Claude ler só os canais que quiser
No pedido seguinte (e entre as voltas do modo autônomo), o PEW copia os dois para a pasta do Claude como
ULTIMA_RODADA.md e ULTIMA_RODADA/.
"""
import json
import math
import re
import shutil
from pathlib import Path

import numpy as np

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
    L = [f"# Resumo da rodada {meta.get('rotulo', npz.stem)}", "",
         f"- modelo: {meta.get('modelo', '?')}",
         f"- estado final: {est.get('estado', '?')}" + (f" — erro: {est['erro']}" if est.get("erro") else "")
         + (f" ({est['segundos']} s de relógio)" if est.get("segundos") is not None else ""),
         f"- tempo simulado: {_fmt(t0)} a {_fmt(t1)} s; passo do Gecko {_fmt(meta.get('dt_gecko'))} s; uma amostra do scope a cada "
         f"{_fmt(meta.get('dt'))} s; Ts do controle {_fmt(ctl.get('Ts')) if ctl else '— (sem controle)'} s; {len(canais)} canais",
         f"- fasores em {f0:g} Hz, por mínimos quadrados num número inteiro de ciclos do fim da janela; fase com referência "
         "cosseno (x ≈ X·cos(ωt + φ)); \"eficaz CA\" é o desvio padrão (sem a média)",
         "- janelas: " + "; ".join(f"J{i + 1} = [{_fmt(a)}, {_fmt(b)}) s" for i, (a, b) in enumerate(js)), "",
         "## Regime (última janela, J5)", "",
         "| canal | média | mín. | máx. | pico a pico | eficaz CA | fasor de 50 Hz (pico ∠ fase) |", "|---|---|---|---|---|---|---|"]
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
        evol.append(f"- {k}: média {' → '.join(medias)}; pico a pico {' → '.join(pps)}")
        # a série reduzida: a média de cada bloco (os blocos vazios ficam de fora)
        nome = re.sub(r"[^\w.\-]", "_", k)
        bl = max(1, math.ceil(len(t) / PONTOS))
        linhas = ["t,valor"]
        for i in range(0, len(t), bl):
            s = ok[i:i + bl]
            if s.any():
                linhas.append(f"{t[i:i + bl][s].mean():.6g},{x[i:i + bl][s].mean():.6g}")
        (destino / "serie" / f"{nome}.csv").write_text("\n".join(linhas) + "\n")
    L += ["", "## Evolução (média e pico a pico em cada janela, J1 → J5)", ""] + evol
    saida = (saida_controle or "").strip()
    if saida:
        L += ["", "## Saída do controle (o fim do controle.log)", "", "```", saida[-3000:], "```"]
    L += ["", f"Séries: serie/<canal>.csv (t, valor; a média de cada bloco de {max(1, math.ceil(len(t) / PONTOS))} amostras do scope)."]
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


def ultima(rodadas):
    """A pasta da rodada mais nova que tem resumo (ou None)."""
    pastas = [p for p in Path(rodadas).glob("*/resumo.md")]
    return max(pastas, key=lambda p: p.stat().st_mtime).parent if pastas else None
