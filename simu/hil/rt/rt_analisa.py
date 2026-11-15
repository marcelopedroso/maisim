"""Lê os .bin do rt_hil e resume: atraso do início, tempo de execução e idade da medida do controle (percentis, em µs), amostras
perdidas, e se a malha fechou (i_L perto do i_ref no fim de cada trecho de 2,5 ms). Com --fig, o cenário 0 e os histogramas.
  python rt_analisa.py rotulo=arquivo.bin [rotulo=arquivo.bin ...] [--fig saida.png]"""
import sys

import numpy as np

REG = np.dtype([("idx", "<i4"), ("atraso", "<i4"), ("exec", "<i4"), ("idade", "<i4"), ("i", "<f4"), ("g", "<f4")])


def le(arq):
    with open(arq, "rb") as f:
        n, ts, dt, S, runs, vazio = np.frombuffer(f.read(48), "<i8")
        return dict(n=int(n), ts=int(ts), dt=int(dt), S=int(S), runs=int(runs), vazio=int(vazio), r=np.frombuffer(f.read(), REG))


def pct(x):
    q = np.percentile(x, [50, 99, 99.9, 100]) / 1e3
    return f"{q[0]:7.2f} {q[1]:7.2f} {q[2]:7.2f} {q[3]:8.2f}"


def resumo(rot, d):
    r, ts, S = d["r"], d["ts"], d["S"]
    total = S * d["runs"]
    run, j = r["idx"] // S, r["idx"] % S
    t = j * ts * 1e-9
    fim = (t >= 9e-3)                              # o último 1 ms do cenário: i_ref = 8 A
    i_fim = float(r["i"][fim].mean()) if fim.any() else float("nan")
    print(f"{rot:22s} Ts={ts/1e3:5.1f}µs  perdidas {total - len(r):6d}/{total} ({100*(total-len(r))/total:5.2f}%)  "
          f"exec>Ts {(r['exec'] > ts).sum():6d}  i_L(9–10 ms) {i_fim:5.2f} A")
    print(f"{'':22s} atraso do início [µs] mediana/p99/p99,9/máx: {pct(r['atraso'])}")
    print(f"{'':22s} execução         [µs] mediana/p99/p99,9/máx: {pct(r['exec'])}")
    print(f"{'':22s} idade da medida  [µs] mediana/p99/p99,9/máx: {pct(r['idade'])}")


def main():
    a = sys.argv[1:]
    fig = a[a.index("--fig") + 1] if "--fig" in a else None
    itens = [x.split("=", 1) for x in a if "=" in x]
    dados = {rot: le(arq) for rot, arq in itens}
    for rot, d in dados.items():
        resumo(rot, d)
    if fig:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        f, ax = plt.subplots(2, 2, figsize=(11, 7))
        primeiro = next(iter(dados.values()))
        r0 = primeiro["r"][primeiro["r"]["idx"] < primeiro["S"]]
        t0 = (r0["idx"] % primeiro["S"]) * primeiro["ts"] * 1e-6
        ax[0, 0].plot(t0, r0["i"], lw=0.6)
        ax[0, 0].set(xlabel="t [ms]", ylabel="i_L [A]", title="cenário 0 (tempo real, planta e controle em núcleos separados)")
        for rot, d in dados.items():
            ax[0, 1].hist(np.clip(d["r"]["atraso"] / 1e3, 0.01, None), bins=np.logspace(-2, 3, 80), histtype="step", label=rot)
            ax[1, 0].hist(np.clip(d["r"]["exec"] / 1e3, 0.01, None), bins=np.logspace(-1, 3, 80), histtype="step", label=rot)
            ax[1, 1].hist(np.clip(d["r"]["idade"] / 1e3, 0.01, None), bins=np.logspace(-1, 3, 80), histtype="step", label=rot)
        for x, tt in ((ax[0, 1], "atraso do início da amostra [µs]"), (ax[1, 0], "execução do controle [µs]"), (ax[1, 1], "idade da medida [µs]")):
            x.set(xscale="log", yscale="log", xlabel=tt, ylabel="amostras"); x.legend(fontsize=7)
        f.tight_layout(); f.savefig(fig, dpi=120)
        print("figura:", fig)


if __name__ == "__main__":
    main()
