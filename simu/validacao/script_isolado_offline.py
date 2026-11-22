"""O modo Script com um Python que ignora o PYTHONPATH e não põe a pasta do script no caminho dos imports (sem instância
de teste). É o Python embutido do MaiSim instalado no Windows (o ._pth): lá um script com `import maisim` não rodava. Aqui o
mesmo comportamento vem do `python -I`, posto no lugar do Python que o modo_script chama. Confere:
- um script que importa o `maisim` e um módulo ao lado dele roda (e o __name__ é "__main__", o sys.argv[0] é o arquivo);
- um script que dá erro devolve o traceback como o de um "python script.py": com o arquivo e a linha do erro, sem os
  quadros do começo que o modo_script usa (runpy, <string>)."""
import os, subprocess, sys, tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path[:0] = [str(AQUI.parent), str(AQUI.parents[1] / "config")]
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


with tempfile.TemporaryDirectory() as d:
    os.environ.update(MAISIM_DADOS=d, MAISIM_SCRIPTS=str(Path(d) / "scripts"), MAISIM_RODADAS=str(Path(d) / "rodadas"))
    import modo_script
    pasta = modo_script.pasta_scripts()
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "vizinho.py").write_text("X = 42\n", encoding="utf-8")
    (pasta / "usa_maisim.py").write_text(
        "import sys\nimport maisim\nimport vizinho\n"
        "print('maisim', hasattr(maisim, 'scope'), 'vizinho', vizinho.X, __name__, sys.argv[0].endswith('usa_maisim.py'))\n",
        encoding="utf-8")
    (pasta / "com_erro.py").write_text("x = 1\n\nraise ValueError('erro de teste')\n", encoding="utf-8")
    real = subprocess.run

    def isolado(cmd, *a, **k):                     # o Python do modo_script com -I: sem PYTHONPATH, sem a pasta do script
        if cmd and cmd[0] == sys.executable:
            cmd = [cmd[0], "-I", *cmd[1:]]
        return real(cmd, *a, **k)
    modo_script.subprocess.run = isolado
    try:
        r = modo_script.roda("usa_maisim")
        ok(r["ok"] and "maisim True vizinho 42 __main__ True" in r["saida"],
           f"com um Python que ignora o PYTHONPATH, o script importa o maisim e o módulo ao lado ({r['saida'].strip()!r}"
           + (f"; erro: {r['erro'].strip().splitlines()[-1]!r}" if r["erro"].strip() else "") + ")")
        r = modo_script.roda("com_erro")
        e = r["erro"]
        ok(not r["ok"] and 'com_erro.py", line 3' in e and "ValueError: erro de teste" in e and "runpy" not in e and "<string>" not in e,
           "o erro sai como o de um \"python script.py\": o arquivo e a linha, sem os quadros do começo ("
           + " · ".join(l.strip() for l in e.strip().splitlines() if "line" in l or "Error" in l)[-200:] + ")")
    finally:
        modo_script.subprocess.run = real
raise SystemExit(1 if falhas else 0)
