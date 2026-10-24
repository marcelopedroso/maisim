"""As portas do config/ler_config.py, sem servidor (Marcelo, 24/10: "um -p da porta, ou um conf: quando baixar, a 7100 pode
estar em uso"). MAISIM_PORTA=8100 muda as sete (8100…8106, a tela :81); uma porta escrita à parte vale mais; sem ela, o
padrão (7100…); o perfil de teste continua na 7200; uma base inválida é recusada."""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
import ler_config  # noqa: E402
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
for k in [k for k in os.environ if k.startswith("MAISIM_")]:
    del os.environ[k]                                 # só os arquivos e o que o teste põe
padrao = ler_config.carrega()
os.environ["MAISIM_PORTA"] = "8100"
v = ler_config.carrega()
ok([v[n] for n, _ in ler_config.PORTAS] == [str(8100 + d) for d in range(7)] and v["MAISIM_TELA_X"] == ":81", f"MAISIM_PORTA=8100: {[v[n] for n, _ in ler_config.PORTAS]}, tela {v['MAISIM_TELA_X']}")
os.environ["MAISIM_PORTA_SCOPE"] = "9999"
v = ler_config.carrega()
ok(v["MAISIM_PORTA_SCOPE"] == "9999" and v["MAISIM_PORTA_SIMU"] == "8101", "uma porta escrita à parte vale mais (scope 9999, simu 8101)")
del os.environ["MAISIM_PORTA"], os.environ["MAISIM_PORTA_SCOPE"]
v = ler_config.carrega()
ok(v["MAISIM_PORTA_PAGINA"] == padrao["MAISIM_PORTA_PAGINA"], f"sem MAISIM_PORTA: o de antes ({v['MAISIM_PORTA_PAGINA']})")
ok(ler_config.carrega("teste")["MAISIM_PORTA_PAGINA"] == "7200", "o perfil de teste continua na 7200")
os.environ["MAISIM_PORTA"] = "80"
try:
    ler_config.carrega(); ok(False, "MAISIM_PORTA=80 deveria ser recusada")
except ValueError as e:
    ok("1024" in str(e), f"MAISIM_PORTA=80 recusada ({e})")
print(f"\n{5 - falhas}/5")
raise SystemExit(1 if falhas else 0)
