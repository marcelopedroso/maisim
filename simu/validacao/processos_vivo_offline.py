"""Saber se um processo está vivo, nos dois sistemas (sem instância de teste). No Linux é o os.kill(pid, 0); no Windows o
sinal 0 é o CTRL_C_EVENT, e o os.kill manda um Ctrl+C de verdade para o grupo do console: na suíte no Windows, a conferência
do lançador no Atualizar (atualizacao.lancador_no_ar) derrubou quem rodava os testes (KeyboardInterrupt). Confere:
- processos.vivo: este processo vivo, um filho vivo, o mesmo filho depois de terminar morto, pid 0 morto;
- atualizacao.lancador_no_ar com o lancador.json de um filho vivo (no mesmo console): devolve o lancador.json, e este
  processo não leva Ctrl+C nenhum; com o filho terminado, None."""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path[:0] = [str(AQUI.parent), str(AQUI.parents[1] / "config")]
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


import processos  # noqa: E402

filho = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
try:
    ok(processos.vivo(os.getpid()) and processos.vivo(filho.pid) and not processos.vivo(0), "vivo: este processo e o filho vivos, o pid 0 não")
    with tempfile.TemporaryDirectory() as d:
        os.environ["MAISIM_CACHE"] = d
        (Path(d) / "lancador.json").write_text(json.dumps({"lancador": filho.pid, "abrir": True}))
        import atualizacao  # noqa: E402
        try:
            r = atualizacao.lancador_no_ar()
            time.sleep(0.5)                                  # um Ctrl+C chegaria aqui
            ok(bool(r) and r.get("lancador") == filho.pid, f"lancador_no_ar com o lançador vivo: {r}, sem Ctrl+C neste processo")
        except KeyboardInterrupt:
            ok(False, "lancador_no_ar mandou um Ctrl+C para o console (o os.kill(pid, 0) no Windows)")
        filho.kill(); filho.wait(10)
        ok(not processos.vivo(filho.pid), "vivo: o filho terminado, morto")
        ok(atualizacao.lancador_no_ar() is None, "lancador_no_ar com o lançador terminado: None")
finally:
    if filho.poll() is None:
        filho.kill()
raise SystemExit(1 if falhas else 0)
