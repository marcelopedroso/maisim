"""As figuras para artigo do módulo Figuras (/maisim/figuras; Marcelo, 29/10: "o MATLAB tem umas figuras muito boas, nós
só salvamos PNG"): de uma rodada gravada (scope_*.npz), os painéis empilhados com o tempo comum, no tamanho exato de uma
coluna de revista, em PDF/SVG/EPS (vetoriais, as fontes embutidas) e PNG/TIFF a 600 dpi, pelo matplotlib.

- os estilos prontos (ESTILOS): IEEE (1 e 2 colunas), Elsevier, MDPI, tese (UTFPR/ABNT), slides e pôster; cada campo pode
  vir trocado no pedido (largura, altura, fonte, corpo);
- os nomes com a notação do MaiSim (a regra do scope: v_o → v com índice o) em mathtext; a unidade sugerida do eixo Y pelo
  nome (v → V, i → A…), que o pedido pode trocar;
- curva com mais pontos visíveis que MAX_PONTOS: o envelope (mínimo e máximo de cada fatia, na ordem), que mantém os
  pulsos do PWM sem um PDF gigante;
- a comparação: a rodada B na mesma cor, mais clara e tracejada; o preto e branco: cinzas e traços diferentes.

figura(pedido) → (bytes, tipo). Sem o matplotlib, ErroFigura com o que instalar."""
import io
import re
import threading
from pathlib import Path

import numpy as np

import lingua

MAX_PONTOS = 4000
CM = 1 / 2.54
# (largura em cm, fonte, corpo em pt, espessura da linha, altura de cada painel em cm, altura fixa em cm ou None)
ESTILOS = {
    "ieee1": dict(largura=8.89, fonte="serif", corpo=8, linha=0.9, painel=3.0),
    "ieee2": dict(largura=18.2, fonte="serif", corpo=8, linha=0.9, painel=3.4),
    "elsevier1": dict(largura=9.0, fonte="serif", corpo=8, linha=0.9, painel=3.0),
    "elsevier2": dict(largura=19.0, fonte="serif", corpo=8, linha=0.9, painel=3.4),
    "mdpi1": dict(largura=8.5, fonte="sans", corpo=8, linha=0.9, painel=3.0),
    "mdpi2": dict(largura=17.0, fonte="sans", corpo=8, linha=0.9, painel=3.4),
    "tese": dict(largura=16.0, fonte="serif", corpo=10, linha=1.0, painel=4.0, lingua="pt"),
    "slides": dict(largura=25.4, fonte="sans", corpo=16, linha=1.8, painel=5.0, altura=14.3),
    "poster": dict(largura=30.0, fonte="sans", corpo=20, linha=2.2, painel=7.0),
}
FORMATOS = {"previa": ("png", "image/png"), "png": ("png", "image/png"), "tiff": ("tiff", "image/tiff"),
            "pdf": ("pdf", "application/pdf"), "svg": ("svg", "image/svg+xml"), "eps": ("eps", "application/postscript")}
TRACOS = {"continua": "-", "tracejada": "--", "pontilhada": ":"}
PB = [("#000000", "-"), ("#000000", "--"), ("#555555", "-"), ("#000000", ":"), ("#555555", "--"), ("#000000", "-.")]
GREGAS = {"theta", "omega", "alpha", "beta", "gamma", "delta", "phi", "psi", "tau", "lambda", "mu", "sigma", "eta", "rho"}
TEXTOS = {"pt": {"tempo": "Tempo", "V": "Tensão", "A": "Corrente", "W": "Potência", "°C": "Temperatura", "rpm": "Velocidade",
                 "rad": "Ângulo", "rad/s": "Velocidade angular", "N·m": "Torque"},
          "en": {"tempo": "Time", "V": "Voltage", "A": "Current", "W": "Power", "°C": "Temperature", "rpm": "Speed",
                 "rad": "Angle", "rad/s": "Angular speed", "N·m": "Torque"}}
RE_NOME = re.compile(r"^([A-Za-z]{1,6})((?:_[A-Za-z0-9]+)*)$")
trava = threading.Lock()                                 # o rcParams do matplotlib é global: uma figura por vez


class ErroFigura(ValueError):
    pass


def nome_mat(canal):
    """O nome em mathtext com a notação do MaiSim: v_o → $v_{\\mathrm{o}}$, Tj_IGBT1 → $\\mathrm{Tj}_{\\mathrm{IGBT1}}$,
    theta → $\\theta$; o que não é um nome simples fica como texto (sem $)."""
    m = RE_NOME.match(str(canal))
    if not m:
        return str(canal).replace("$", r"\$")
    base, sub = m.group(1), [s for s in m.group(2).split("_") if s]
    b = "\\" + base if base.lower() in GREGAS and base.islower() else (base if len(base) == 1 else r"\mathrm{" + base + "}")
    return f"${b}_{{\\mathrm{{{','.join(sub)}}}}}$" if sub else f"${b}$"


def unidade(canal):
    """A unidade sugerida pelo nome (a 1ª letra, ou a palavra): "" quando não dá para saber (d, g, m…)."""
    c = str(canal)
    base = c.split("_")[0]
    if base.lower() in ("theta", "th", "ang"):
        return "rad"
    if base.lower() in ("omega", "w", "wm", "we"):
        return "rad/s"
    if base in ("n",) or base.startswith("n") and len(base) > 1 and base[1:].isupper():
        return "rpm"
    if base in ("Tel", "Te", "Tm", "Tl", "Tc_m"):
        return "N·m"
    p = base[:1]                                         # (potência só com P maiúsculo: "portadora" não é W)
    return {"v": "V", "u": "V", "V": "V", "U": "V", "i": "A", "I": "A", "P": "W", "T": "°C"}.get(p, "")


def rotulo_y(sinais, lingua_fig):
    """O rótulo do eixo Y de um painel: um sinal → o nome e a unidade; vários da mesma unidade → a grandeza e a unidade."""
    us = {unidade(s) for s in sinais}
    u = us.pop() if len(us) == 1 else ""
    if len(sinais) == 1:
        return f"{nome_mat(sinais[0])} ({u})" if u else nome_mat(sinais[0])
    return f"{TEXTOS[lingua_fig].get(u, '')} ({u})".strip() if u else ""


def envelope(t, y, max_pontos=MAX_PONTOS):
    """Menos pontos sem perder os picos: em cada fatia, o mínimo e o máximo, na ordem em que aparecem."""
    n = len(y)
    if n <= max_pontos:
        return t, y
    k = int(np.ceil(n / (max_pontos // 2)))
    m = n // k * k
    blocos = y[:m].reshape(-1, k)
    validos = ~np.all(np.isnan(blocos), axis=1)
    bl = np.where(np.isnan(blocos), np.nanmean(blocos[validos]) if validos.any() else 0.0, blocos)
    i_min, i_max = bl.argmin(axis=1), bl.argmax(axis=1)
    base = np.arange(blocos.shape[0]) * k
    idx = np.sort(np.stack([base + np.minimum(i_min, i_max), base + np.maximum(i_min, i_max)], axis=1), axis=1).ravel()
    idx = np.concatenate([idx, np.arange(m, n)])
    return t[idx], y[idx]


def le_rodada(arq):
    """{canal: (t, y)} e a meta de um scope_*.npz; os canais finos (mais amostras que o tempo) com o tempo deles."""
    import json
    d = np.load(arq, allow_pickle=False)
    meta = json.loads(str(d["meta"])) if "meta" in d.files else {}
    if "t" not in d.files:
        raise ErroFigura(lingua.tr("figura.sem_tempo"))
    t = np.asarray(d["t"], dtype=float)
    out = {}
    for k in d.files:
        if k in ("meta", "t"):
            continue
        y = np.ravel(d[k]).astype(float)
        if len(y) == len(t):
            out[k] = (t, y)
        elif len(y) > len(t) > 1:                          # passo fino: n amostras por intervalo do tempo
            out[k] = (np.linspace(t[0], t[-1] + (t[-1] - t[-2]) * (1 - len(t) / len(y)), len(y)), y)
    return out, meta


def _clareia(cor, f=0.45):
    from matplotlib.colors import to_rgb
    r, g, b = to_rgb(cor)
    return (r + (1 - r) * f, g + (1 - g) * f, b + (1 - b) * f)


def _unidade_tempo(t0, t1):
    """A unidade do eixo do tempo pelo fim da janela (de 10 a 10,5 ms: "ms", não "10000 µs")."""
    fim = max(abs(t0), abs(t1))
    return (1e6, "µs") if fim < 2e-3 else (1e3, "ms") if fim < 2 else (1.0, "s")


def figura(pedido, resolve=lambda rel: Path(rel)):
    """O arquivo da figura (bytes, tipo MIME). pedido: {arq, arqB?, t0?, t1?, paineis: [{sinais: [{canal, cor?, esp?, traco?,
    ganho?, desloc?}], ylabel?, ymin?, ymax?}], estilo: {preset, largura?, altura?, fonte?, corpo?, grade?, legenda?, pb?,
    letras?, lingua?}, formato}. resolve: o caminho de uma rodada (o servidor confere que é uma gravação permitida)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        from matplotlib.figure import Figure
    except ImportError as e:
        raise ErroFigura(lingua.tr("figura.sem_matplotlib")) from e
    formato = str(pedido.get("formato") or "previa")
    if formato not in FORMATOS:
        raise ErroFigura(lingua.tr("figura.formato", formato=formato))
    paineis = [p for p in pedido.get("paineis") or [] if p.get("sinais")]
    if not paineis:
        raise ErroFigura(lingua.tr("figura.sem_sinais"))
    est = dict(ESTILOS.get(str((pedido.get("estilo") or {}).get("preset") or "ieee1"), ESTILOS["ieee1"]))
    est.update({k: v for k, v in (pedido.get("estilo") or {}).items() if v not in (None, "") and k != "preset"})
    lg = est.get("lingua") if est.get("lingua") in TEXTOS else lingua.atual() if lingua.atual() in TEXTOS else "pt"
    A, meta = le_rodada(resolve(pedido["arq"]))
    B = le_rodada(resolve(pedido["arqB"]))[0] if pedido.get("arqB") else {}
    tudo = [v[0] for v in A.values()]
    t_ini = min(float(x[0]) for x in tudo) if tudo else 0.0
    t_fim = max(float(x[-1]) for x in tudo) if tudo else 1.0
    t0 = float(pedido["t0"]) if pedido.get("t0") is not None else t_ini
    t1 = float(pedido["t1"]) if pedido.get("t1") is not None else t_fim
    if not t1 > t0:
        raise ErroFigura(lingua.tr("figura.janela"))
    esc, ut = _unidade_tempo(t0, t1)
    largura = float(est["largura"])
    n = len(paineis)
    altura = float(est.get("altura") or min(24.0, 1.2 + est["painel"] * n))
    serif = est.get("fonte") != "sans"
    corpo = float(est.get("corpo") or 8)
    rc = {"font.family": "serif" if serif else "sans-serif", "font.serif": ["STIXGeneral", "DejaVu Serif"],
          "font.sans-serif": ["DejaVu Sans"], "mathtext.fontset": "stix" if serif else "dejavusans",
          "font.size": corpo, "axes.labelsize": corpo, "xtick.labelsize": corpo * 0.92, "ytick.labelsize": corpo * 0.92,
          "legend.fontsize": corpo * 0.88, "axes.linewidth": 0.6 * corpo / 8, "xtick.major.width": 0.6 * corpo / 8,
          "ytick.major.width": 0.6 * corpo / 8, "xtick.direction": "in", "ytick.direction": "in", "xtick.top": True,
          "ytick.right": True, "grid.color": "#c8c8c8", "grid.linewidth": 0.4 * corpo / 8, "lines.linewidth": float(est["linha"]),
          "pdf.fonttype": 42, "ps.fonttype": 42, "svg.fonttype": "none", "axes.unicode_minus": True,
          "figure.facecolor": "white", "axes.facecolor": "white", "savefig.facecolor": "white"}
    with trava, matplotlib.rc_context(rc):
        fig = Figure(figsize=(largura * CM, altura * CM), layout="constrained")
        axs = fig.subplots(n, 1, sharex=True, squeeze=False)[:, 0]
        for k, (ax, p) in enumerate(zip(axs, paineis)):
            nomes = []
            for j, s in enumerate(p["sinais"]):
                canal = s["canal"] if isinstance(s, dict) else str(s)
                s = s if isinstance(s, dict) else {"canal": canal}
                if canal not in A:
                    continue
                nomes.append(canal)
                cor, traco = (PB[j % len(PB)] if est.get("pb") else (s.get("cor") or f"C{j}", TRACOS.get(s.get("traco"), "-")))
                larg = float(est["linha"]) * float(s.get("esp") or 1.3) / 1.3
                ganho, desloc = float(s.get("ganho") or 1), float(s.get("desloc") or 0)
                for F, sufixo, clara in ((A, "", False), (B, " (B)", True)):
                    if canal not in F:
                        continue
                    t, y = F[canal]
                    sel = (t >= t0) & (t <= t1)
                    tt, yy = envelope(t[sel], y[sel] * ganho + desloc)
                    ax.plot(tt * esc, yy, color=_clareia(cor) if clara else cor, linestyle="--" if clara else traco,
                            linewidth=larg, label=nome_mat(canal) + sufixo)
            ax.set_xlim(t0 * esc, t1 * esc)
            if p.get("ymin") is not None or p.get("ymax") is not None:
                ax.set_ylim(p.get("ymin"), p.get("ymax"))
            yl = p.get("ylabel")
            ax.set_ylabel(rotulo_y(nomes, lg) if yl is None else yl)
            if est.get("grade", True):
                ax.grid(True)
            leg = est.get("legenda", "melhor")
            if est.get("letras") and n > 1:                   # em cima do painel, à esquerda (a legenda "no melhor lugar" não a cobre);
                if leg == "acima":                            # com a legenda acima, dentro, no canto
                    ax.text(0.012, 0.96, f"({chr(97 + k)})", transform=ax.transAxes, va="top", ha="left")
                else:
                    ax.set_title(f"({chr(97 + k)})", loc="left", fontsize=corpo, pad=2)
            if leg != "nenhuma" and (len(nomes) > 1 or B):
                if leg == "acima":
                    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0, 1, 0.2), mode="expand", ncol=min(4, max(1, len(ax.lines))),
                              frameon=False, borderaxespad=0.2, handlelength=1.8)
                else:
                    ax.legend(loc="best", frameon=True, framealpha=1.0, edgecolor="#bbbbbb", fancybox=False, handlelength=1.8)
        axs[-1].set_xlabel(f"{TEXTOS[lg]['tempo']} ({ut})")
        ext, tipo = FORMATOS[formato]
        buf = io.BytesIO()
        extra = {"dpi": 600} if formato in ("png", "tiff") else {"dpi": 150} if formato == "previa" else {}
        if formato == "tiff":
            extra["pil_kwargs"] = {"compression": "tiff_lzw"}
        fig.savefig(buf, format=ext, **extra)
    return buf.getvalue(), tipo
