"""A janela do lançador (app/lancador.py, abre()) e o atalho do Windows para a versão de programador no WSL, sem servidor
(Marcelo, 28/10: o ícone borrado da janela --app; "um atalho no desktop do Windows que abre sem abrir o navegador"):
- sem MAISIM_APP_ID, a janela --app=<url>; com ele (o MaiSim instalado como app no Chrome/Edge), o app: --app-id=<id> e
  --app-launch-url-for-shortcuts-menu-item=<url> (a mesma página, "Abrindo o MaiSim…"); MAISIM_NAVEGADOR=nenhum não abre;
- app/scripts/atalho_windows.sh --mostrar: o atalho, o wscript com o abrir.vbs, o ícone e o wsl.exe -d <distro> --cd <raiz>
  com o maisim.sh --abrir; a janela que vai abrir (o app, com MAISIM_APP_ID);
- a tela do Gecko no navegador (tela_gecko; Marcelo, 01/11: "não deveríamos deixar editar"): sem MAISIM_TELA_GECKO=1, nem o
  x11vnc nem o websockify sobem (e a senha antiga sai); com ele, o x11vnc com senha (o arquivo só do dono) e só para ver, sem
  -nopw, sem as variáveis do Wayland, e o websockify só para a origem da página; o gecko/sobe.sh com as mesmas regras."""
import os, stat, subprocess, sys, tempfile
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
# a tela do Gecko (o que o lançador sobe, anotado em vez de subir)
T = Path(tempfile.mkdtemp(prefix="maisim-tela-")); (T / "novnc").mkdir(); (T / "gecko").mkdir()
lancador.NOVNC = str(T / "novnc"); lancador.shutil.which = lambda p: f"/usr/bin/{p}"
lc.cfg = {"MAISIM_PORTA_PAGINA": "7390", "MAISIM_PORTA_TELA": "7395", "MAISIM_PORTA_VNC": "7396"}
subidos = []
lc.sobe = lambda nome, args, log, env=None: subidos.append((nome, args, env))
senha = T / "gecko" / "vnc.senha"; senha.write_text("antiga\n")
os.environ.pop("MAISIM_TELA_GECKO", None); lc.tela_gecko(T / "gecko", ":73")
ok(not subidos and not senha.exists(), f"sem MAISIM_TELA_GECKO=1: nada sobe e a senha antiga sai ({subidos})")
os.environ["MAISIM_TELA_GECKO"] = "1"; lc.tela_gecko(T / "gecko", ":73")
x11 = next((s for s in subidos if s[0] == "x11vnc"), None); ws = next((s for s in subidos if s[0] == "websockify"), None)
ok(x11 and "-viewonly" in x11[1] and "-nopw" not in x11[1] and "-localhost" in x11[1] and x11[1][x11[1].index("-passwdfile") + 1] == str(senha)
   and x11[2] == {"WAYLAND_DISPLAY": None, "XDG_SESSION_TYPE": None}, f"o x11vnc: com senha, só para ver, sem as variáveis do Wayland ({x11})")
ok(senha.is_file() and stat.S_IMODE(senha.stat().st_mode) == 0o600 and len(senha.read_text().strip()) == 8, "a senha: 8 caracteres, no arquivo só do dono (600)")
ok(ws and "websockify.auth_plugins.ExpectOrigin" in ws[1] and ws[1][ws[1].index("--auth-source") + 1].split() == ["http://localhost:7390", "http://127.0.0.1:7390", "http://[::1]:7390"],
   f"o websockify: só a origem da página ({ws[1] if ws else None})")
sobe_sh = (R / "gecko" / "sobe.sh").read_text()
ok("-nopw" not in sobe_sh and "-viewonly" in sobe_sh and "-passwdfile" in sobe_sh and "ExpectOrigin" in sobe_sh, "o gecko/sobe.sh: com senha, só para ver e só a origem da página")
os.environ.pop("MAISIM_TELA_GECKO", None)
for f in sorted(T.rglob("*"), reverse=True):
    f.unlink() if (f.is_file() or f.is_symlink()) else f.rmdir()
T.rmdir()
sys.exit(1 if falhas else 0)
