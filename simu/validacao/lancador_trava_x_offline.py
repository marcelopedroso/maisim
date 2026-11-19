"""A trava da tela virtual que sobrou (Marcelo, 18/11: depois do Atualizar, o Xvfb antigo tinha morrido sem apagar
/tmp/.X71-lock; o novo recusou e o Gecko ficou "sem o motor do editor"). app/lancador.py limpa_trava_x, numa pasta
temporária (nunca o /tmp de verdade):
- o dono da trava morreu: apaga a trava e o socket velho;
- o dono é um zumbi (morreu, o pai não recolheu — o caso de 18/11): apaga;
- o dono está vivo: não mexe;
- sem trava, ou ilegível: nada."""
import os, subprocess, sys, tempfile, time
from pathlib import Path

R = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(R / "app"))
import lancador  # noqa: E402

falhas = 0
def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t, flush=True)
    falhas += (not c)


with tempfile.TemporaryDirectory() as base:
    b = Path(base); (b / ".X11-unix").mkdir()
    def poe(pid):
        (b / ".X71-lock").write_text(f"{pid:>10}\n"); (b / ".X11-unix" / "X71").write_text("")
    p = subprocess.Popen(["true"]); p.wait()            # um pid que já morreu (e foi recolhido)
    poe(p.pid)
    ok(lancador.limpa_trava_x(":71", base) and not (b / ".X71-lock").exists() and not (b / ".X11-unix" / "X71").exists(),
       "o dono morreu: a trava e o socket velho saem")
    z = subprocess.Popen(["true"]); time.sleep(0.5)     # sem o wait: um zumbi
    poe(z.pid)
    ok(lancador.limpa_trava_x(":71", base) and not (b / ".X71-lock").exists(), "o dono é um zumbi (o caso de 18/11): a trava sai")
    z.wait()
    poe(os.getpid())
    ok(not lancador.limpa_trava_x(":71", base) and (b / ".X71-lock").exists(), "o dono está vivo: não mexe")
    (b / ".X71-lock").unlink()
    ok(not lancador.limpa_trava_x(":71", base), "sem trava: nada")
    (b / ".X71-lock").write_text("lixo")
    ok(not lancador.limpa_trava_x(":71.0", base) and (b / ".X71-lock").exists(), "trava ilegível (e a tela com .0): não mexe")

print(f"\nlancador_trava_x_offline: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
