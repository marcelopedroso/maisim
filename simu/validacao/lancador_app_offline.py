"""A janela do lançador (app/lancador.py, abre()) e o atalho do Windows para a versão de programador no WSL, sem servidor
(Marcelo, 28/10: o ícone borrado da janela --app; "um atalho no desktop do Windows que abre sem abrir o navegador"):
- sem MAISIM_APP_ID, a janela --app=<url>; com ele (o MaiSim instalado como app no Chrome/Edge), o app: --app-id=<id> e
  --app-launch-url-for-shortcuts-menu-item=<url> (a mesma página, "Abrindo o MaiSim…"); MAISIM_NAVEGADOR=nenhum não abre;
- app/scripts/atalho_windows.sh --mostrar: o atalho, o wscript com o abrir.vbs, o ícone e o wsl.exe -d <distro> --cd <raiz>
  com o maisim.sh --abrir; a janela que vai abrir (o app, com MAISIM_APP_ID)."""
import os, subprocess, sys
from pathlib import Path
R = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(R / "app"))
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
for k in [k for k in os.environ if k.startswith("MAISIM_")]:
    del os.environ[k]
import lancador  # noqa: E402
abertos = []
POPEN = subprocess.Popen
lancador.subprocess.Popen = lambda cmd, **kw: abertos.append(cmd)   # anota em vez de abrir (o mesmo módulo: volta no fim)
lc = lancador.Lancador.__new__(lancador.Lancador); lc.cfg = {"MAISIM_PORTA_PAGINA": "7390"}
def abre(nav, app_id=None):
    abertos.clear(); os.environ["MAISIM_NAVEGADOR"] = nav
    os.environ.pop("MAISIM_APP_ID", None)
    if app_id is not None: os.environ["MAISIM_APP_ID"] = app_id
    lc.abre("abrindo.html"); return abertos[0] if abertos else None
URL = "http://localhost:7390/abrindo.html"
c = abre("/bin/true")
ok(c == ["/bin/true", f"--app={URL}"], f"sem MAISIM_APP_ID: a janela --app ({c})")
c = abre("/bin/true", "kloknaljbhbdmmnembbaklkjdkcbfkgk")
ok(c == ["/bin/true", "--app-id=kloknaljbhbdmmnembbaklkjdkcbfkgk", f"--app-launch-url-for-shortcuts-menu-item={URL}"], f"com MAISIM_APP_ID: o app instalado, na mesma página ({c})")
c = abre('"/bin/true" --profile-directory="Profile 1"', "kloknaljbhbdmmnembbaklkjdkcbfkgk")
ok(c and c[:2] == ["/bin/true", "--profile-directory=Profile 1"] and c[2].startswith("--app-id="), f"com as opções do MAISIM_NAVEGADOR (o perfil) antes ({c})")
ok(abre("/bin/true", "  ") == ["/bin/true", f"--app={URL}"], "MAISIM_APP_ID só com espaços: a janela --app")
ok(abre("nenhum", "kloknaljbhbdmmnembbaklkjdkcbfkgk") is None, "MAISIM_NAVEGADOR=nenhum: não abre nada")
subprocess.Popen = POPEN
# o atalho (o --mostrar não cria nada; fora do WSL, com as pastas do Windows por extenso)
env = {k: v for k, v in os.environ.items() if not k.startswith("MAISIM_") and k not in ("LC_ALL", "LC_MESSAGES")}
env["LANG"] = "pt_BR.UTF-8"                              # as linhas do --mostrar em português (o fala.sh segue o idioma do terminal)
def mostra(**e):
    r = subprocess.run(["bash", str(R / "app/scripts/atalho_windows.sh"), "--mostrar"], capture_output=True, text=True, env={**env, **e}, timeout=60)
    return r.returncode, r.stdout
cod, out = mostra(WSL_DISTRO_NAME="Ubuntu-22.04")
linhas = dict(l.split(": ", 1) for l in out.splitlines() if ": " in l)
ok(cod == 0 and linhas.get("atalho", "").endswith("\\MaiSim (dev).lnk") and "wscript.exe" in linhas.get("alvo", "") and linhas.get("alvo", "").endswith('\\MaiSim-dev\\abrir.vbs"')
   and linhas.get("ícone", "").endswith("\\MaiSim-dev\\maisim.ico"), f"o atalho: {linhas.get('atalho')} → {linhas.get('alvo')}")
ok(linhas.get("abrir.vbs roda, escondido") == f'wsl.exe -d Ubuntu-22.04 --cd "{R}" -- bash -lc "exec app/scripts/maisim.sh --abrir"',
   f"o abrir.vbs: {linhas.get('abrir.vbs roda, escondido')}")
ok(linhas.get("janela", "").startswith("a do --app"), f"sem MAISIM_APP_ID: {linhas.get('janela')}")
cod, out = mostra(WSL_DISTRO_NAME="Ubuntu-22.04", MAISIM_APP_ID="kloknaljbhbdmmnembbaklkjdkcbfkgk")
ok(cod == 0 and "janela: o app instalado (MAISIM_APP_ID)" in out, "com MAISIM_APP_ID: a janela do app instalado")
cod, out = mostra(WSL_DISTRO_NAME="Ubuntu-22.04", LANG="C.UTF-8")
ok(cod == 0 and "shortcut: " in out and "abrir.vbs runs, hidden: wsl.exe -d Ubuntu-22.04" in out and "window: the --app one" in out,
   "em inglês (LANG=C): shortcut, target, icon, abrir.vbs runs, window")
ok(subprocess.run(["bash", str(R / "app/scripts/atalho_windows.sh"), "--outra"], capture_output=True, env=env).returncode == 2, "opção desconhecida: recusada (saída 2)")
sys.exit(1 if falhas else 0)
