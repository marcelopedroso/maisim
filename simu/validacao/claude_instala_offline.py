"""Offline: o Claude Code no Windows e a instalação pela janela das contas, sem servidor no ar nem instalador de verdade.
  o caminho do claude no Windows (os.name de mentira): claude.exe no PATH, senão %USERPROFILE%\\.local\\bin\\claude.exe (nunca o
  claude sem .exe nem o claude.cmd do npm); procurado de novo quando aparece depois (sem reiniciar); o ambiente do filho com as
  variáveis do Windows; o comando do instalador (o PowerShell oficial) só no Windows; e o fluxo inteiro com um instalador de
  mentira (MAISIM_INSTALA_CLAUDE_CMD): começa, um por vez, a saída, termina, acha o claude novo; o erro, o prazo, o "não achou"."""
import importlib, importlib.util, os, shutil, sys, tempfile, time, types
from pathlib import Path
P = Path(__file__).resolve().parents[1]                        # simu/
sys.path.insert(0, str(P))
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)

T = Path(tempfile.mkdtemp(prefix="maisim-instala-"))
casa, bin_ = T / "casa", T / "bin"
casa.mkdir(); bin_.mkdir()
os.environ.pop("MAISIM_CLAUDE_BIN", None)
import ia as ias  # noqa: E402
import ia.base as base  # noqa: E402

# ---- o caminho do claude, com o Windows de mentira: um os com name = "nt" só para o ia/ (o pathlib e o shutil.which seguem
# os do Linux: o Path do Python 3.10 confere o os.name de verdade)
os_win = types.ModuleType("os"); os_win.__dict__.update(os.__dict__); os_win.name = "nt"
path_antes = os.environ.get("PATH", "")
try:
    ias.os = os_win
    os.environ["USERPROFILE"] = str(casa)
    os.environ["PATH"] = str(bin_)
    (bin_ / "claude").write_text("#!/bin/sh\n"); (bin_ / "claude").chmod(0o755)   # um claude sem .exe e um claude.cmd (o do npm):
    (bin_ / "claude.cmd").write_text("@echo off\n"); (bin_ / "claude.cmd").chmod(0o755)   # nenhum serve no Windows
    oficial = casa / ".local" / "bin" / "claude.exe"
    ok(ias.acha_claude() == str(oficial), f"Windows: sem claude.exe, o lugar do instalador oficial ({ias.acha_claude()})")
    c = ias.Claude(ias.acha_claude(), T / "conf"); c.acha = ias.acha_claude
    ok(not c.instalado(), "ainda não instalado")
    oficial.parent.mkdir(parents=True); oficial.write_text("x")
    ok(c.instalado() and c.bin == str(oficial), "o claude.exe aparece depois (fora do PATH deste processo): achado sem reiniciar")
    (bin_ / "claude.exe").write_text("x"); (bin_ / "claude.exe").chmod(0o755)
    ok(ias.acha_claude() == str(bin_ / "claude.exe"), "Windows: o claude.exe do PATH vem primeiro")
    os.environ["MAISIM_CLAUDE_BIN"] = "/outro/claude"
    ok(ias.acha_claude() == "/outro/claude", "MAISIM_CLAUDE_BIN (os testes) vale mais")
    del os.environ["MAISIM_CLAUDE_BIN"]
    # o ambiente do filho no Windows: a lista branca com as variáveis do sistema (SYSTEMROOT, USERPROFILE, APPDATA, TEMP…)
    os.environ.update(SYSTEMROOT=r"C:\Windows", APPDATA=r"C:\x\Roaming", TEMP=r"C:\x\Temp", ANTHROPIC_API_KEY="nao-vaza")
    sys.modules["os"] = os_win                       # o base.py relido vê o Windows (o import os dele)
    try:
        b2 = importlib.reload(base)
    finally:
        sys.modules["os"] = os
    amb = b2.IA("x", T / "conf").ambiente()
    ok(all(k in amb for k in ("SYSTEMROOT", "USERPROFILE", "APPDATA", "TEMP", "PATH")) and "ANTHROPIC_API_KEY" not in amb,
       f"Windows: o ambiente do filho leva {sorted(k for k in amb if k.isupper())[:8]}…, sem a chave de API")
finally:
    ias.os = os
    os.environ["PATH"] = path_antes
    for k in ("USERPROFILE", "SYSTEMROOT", "APPDATA", "TEMP", "ANTHROPIC_API_KEY"):
        os.environ.pop(k, None)
    importlib.reload(base)
ok("SYSTEMROOT" not in base.ENV_BRANCA, "no Linux, a lista branca de antes")
ok(ias.acha_claude() in (shutil.which("claude"), str(Path.home() / ".local" / "bin" / "claude"), str(base.FERRAMENTAS / ".local" / "bin" / "claude")),
   f"Linux: o do PATH, o da pasta pessoal ou o da pasta de ferramentas do MaiSim ({ias.acha_claude()})")

# ---- o servidor, com um claude ainda não instalado e um instalador de mentira (que põe um claude de mentira no lugar)
alvo = T / "inst" / "claude"
falso_claude = '#!/usr/bin/env python3\nimport json; print(json.dumps({"loggedIn": False}))\n'
instalador = T / "instalador.py"
instalador.write_text("import sys, time, pathlib, os\n"
                      "modo = sys.argv[2]\n"
                      "print('Setting up Claude Code...', flush=True); time.sleep(float(os.environ.get('ESPERA', '0.6')))\n"
                      "if modo == 'erro': print('Failed to download binary', flush=True); sys.exit(3)\n"
                      "if modo == 'ok':\n"
                      "    a = pathlib.Path(sys.argv[1]); a.parent.mkdir(parents=True, exist_ok=True)\n"
                      f"    a.write_text({falso_claude!r}); a.chmod(0o755)\n"
                      "print('Installation complete!', flush=True)\n")
os.environ.update(MAISIM_PERFIL="teste", MAISIM_CLAUDE_BIN=str(alvo), MAISIM_CLAUDE_DIR=str(T / "claude-maisim"), MAISIM_CURSOR_DIR=str(T / "cursor-maisim"),
                  MAISIM_SIMU_CACHE=str(T / "cache"), MAISIM_CACHE=str(T / "cache"))
def cmd(modo):
    return f"{sys.executable} {instalador} {alvo} {modo}"
os.environ["MAISIM_INSTALA_CLAUDE_CMD"] = cmd("ok")
spec = importlib.util.spec_from_file_location("srv", P / "servidor.py"); srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)
def espera_fim(seg=20):
    for _ in range(int(seg / 0.1)):
        st = srv.claude_instala_estado()
        if not st["andamento"]:
            return st
        time.sleep(0.1)
    return st
e = srv.claude_estado()
ok(not e["instalado"] and e["pode_instalar"] and e["sistema"] == "linux" and "instalacao" not in e, f"antes: não instalado, pode instalar ({e['sistema']})")
st = srv.claude_instala_inicia()
pid = srv.claude_instala["proc"].pid
st2 = srv.claude_instala_inicia()
ok(st["andamento"] and st2["andamento"] and srv.claude_instala["proc"].pid == pid, "começa; um segundo clique não abre outro instalador")
ok(st.get("ia") == "claude" and srv.CLAUDE.comando_instala() == srv.IAS["claude"].comando_instala(), "a instalação diz de qual IA é (o instalador é da peça: comando_instala)")
try:
    srv.claude_instala_inicia("nenhuma"); ok(False, "IA desconhecida deveria ser recusada")
except srv.ErroMotor as x:
    ok("nenhuma" in str(x), f"instalar uma IA desconhecida: recusa ({x})")
ok(srv.claude_estado()["instalacao"]["andamento"], "o estado do Claude traz a instalação em andamento (a janela reaberta a vê)")
st = espera_fim()
ok(st["ok"] and st["erro"] is None and "Setting up Claude Code" in st["saida"] and "Installation complete" in st["saida"],
   f"termina bem, com a saída do instalador ({st['saida']!r})")
e = srv.claude_estado()
ok(e["instalado"] and srv.CLAUDE.bin == str(alvo) and not e["logado"] and "erro" not in e, "depois: instalado e deslogado (o auth status do claude novo), sem reiniciar")
try:
    srv.claude_instala_inicia(); ok(False, "instalar de novo deveria ser recusado")
except srv.ErroMotor as x:
    ok("já está instalado" in str(x), f"já instalado: recusa ({x})")
alvo.unlink()
for modo, espera_txt, extra in (("erro", "saída 3", {}), ("nada", "não apareceu", {}), ("ok", "passou de", {"prazo": True})):
    os.environ["MAISIM_INSTALA_CLAUDE_CMD"] = cmd(modo)
    if extra.get("prazo"):
        srv.CLAUDE_INSTALA_PRAZO, os.environ["ESPERA"] = 1, "5"
    srv.claude_instala_inicia(); st = espera_fim()
    ok(not st["ok"] and espera_txt in (st["erro"] or "") and not srv.CLAUDE.instalado(), f"{modo if not extra else 'prazo'}: {st['erro']}")
    srv.CLAUDE_INSTALA_PRAZO = 15 * 60; os.environ.pop("ESPERA", None)
alvo.unlink(missing_ok=True)
# o servidor saindo no meio: o instalador cai junto (o atexit), não fica sozinho instalando
os.environ["MAISIM_INSTALA_CLAUDE_CMD"], os.environ["ESPERA"] = cmd("ok"), "30"
srv.claude_instala_inicia(); proc = srv.claude_instala["proc"]; time.sleep(0.5)
srv.claude_instala_para()
for _ in range(30):
    if proc.poll() is not None:
        break
    time.sleep(0.1)
ok(proc.poll() is not None and not srv.CLAUDE.instalado(), f"o servidor saindo: o instalador em andamento é encerrado (saída {proc.poll()})")
os.environ.pop("ESPERA", None); espera_fim()
alvo.unlink(missing_ok=True)
# fora do Windows, sem o instalador de mentira: o instalador oficial (curl … | bash) com a casa na pasta de ferramentas do
# MaiSim — o programa fica fora da pasta pessoal (não roda aqui: só o comando é conferido)
del os.environ["MAISIM_INSTALA_CLAUDE_CMD"]
c = srv.CLAUDE.comando_instala()
ok(c and c[0] == "env" and f"HOME={base.FERRAMENTAS}" in c and c[-1].endswith("curl -fsSL https://claude.ai/install.sh | bash")
   and "XDG_DATA_HOME" in c and srv.claude_estado()["pode_instalar"], f"Linux: o instalador oficial com HOME na pasta do MaiSim ({c and c[-1]})")
srv.processos.WIN = True
try:
    c = srv.CLAUDE.comando_instala()
finally:
    srv.processos.WIN = False
ok(c and c[0].endswith("powershell.exe") and c[-1].endswith("irm https://claude.ai/install.ps1 | iex") and "-NoProfile" in c
   and not any("runas" in x.lower() or "verb" in x.lower() for x in c), f"Windows: o instalador oficial no PowerShell, sem pedir administrador ({c[-1]})")
shutil.rmtree(T, ignore_errors=True)
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
