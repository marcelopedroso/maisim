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
for base in ("6000", "5995"):                           # a 6000 (X11) os navegadores recusam: ERR_UNSAFE_PORT (Marcelo, 24/10)
    os.environ["MAISIM_PORTA"] = base
    try:
        ler_config.carrega(); ok(False, f"MAISIM_PORTA={base} deveria ser recusada (a 6000 está nas sete)")
    except ValueError as e:
        ok("6000" in str(e), f"MAISIM_PORTA={base} recusada: a 6000 está nas sete ({e})")
ok(ler_config.porta_bloqueada(8100) is None and ler_config.porta_bloqueada(10075) == 10080, "porta_bloqueada: 8100 livre, 10075 pega a 10080")
# o perfil produto (a versão "só usar": o instalador do Windows, o AppImage), num HOME de mentira
import tempfile
del os.environ["MAISIM_PORTA"]
h = tempfile.mkdtemp(); os.environ["HOME"] = h
for k in ("XDG_CONFIG_HOME", "XDG_CACHE_HOME"):
    os.environ.pop(k, None)
v = ler_config.carrega("produto")
ok(v["MAISIM_DADOS"] == f"{h}/MaiSim" and v["MAISIM_CACHE"] == f"{h}/.cache/maisim" and v["MAISIM_PORTA_PAGINA"] == "7100"
   and v["MAISIM_CONFIG_PESSOAL"] == f"{h}/.config/maisim/maisim.env",
   f"produto: dados à vista em ~/MaiSim, cache em ~/.cache/maisim, a config pessoal em ~/.config/maisim ({v['MAISIM_DADOS']})")
pessoal = Path(v["MAISIM_CONFIG_PESSOAL"]); pessoal.parent.mkdir(parents=True); pessoal.write_text("MAISIM_PORTA=8100\nMAISIM_DADOS=~/Outra\n")
v = ler_config.carrega("produto")
ok(v["MAISIM_PORTA_PAGINA"] == "8100" and v["MAISIM_TELA_X"] == ":81" and v["MAISIM_DADOS"] == f"{h}/Outra",
   "produto: a config pessoal (a porta e a pasta que o instalador pergunta) vale por cima")
pessoal.unlink()
ok(ler_config.carrega("produto")["MAISIM_CLAUDE_DIR"] == f"{h}/.claude-maisim", "produto no Linux: o login do Claude em ~/.claude-maisim (o de antes)")
ok(ler_config.carrega("produto")["MAISIM_DEEPSEEK_DIR"] == f"{h}/.deepseek-maisim", "produto no Linux: a pasta da DeepSeek em ~/.deepseek-maisim")
v = ler_config.carrega("produto")
ok(v["MAISIM_CURSOR_DIR"] == f"{h}/.cursor-maisim" and v["MAISIM_CURSOR_ENTRADA"] == "login,chave",
   f"produto no Linux: a casa do Cursor em ~/.cursor-maisim, o login antes da chave ({v['MAISIM_CURSOR_DIR']})")
# o produto no Windows (um os com name = "nt" só para o ler_config): o login do Claude ao lado da config, em %APPDATA%\\MaiSim\\claude
import types
os_win = types.ModuleType("os"); os_win.__dict__.update(os.__dict__); os_win.name = "nt"
os.environ["APPDATA"], os.environ["LOCALAPPDATA"] = f"{h}/Roaming", f"{h}/Local"
ler_config.os = os_win
try:
    v = ler_config.carrega("produto")
    ok(v["MAISIM_CLAUDE_DIR"] == f"{h}/Roaming/MaiSim/claude" and v["MAISIM_CONFIG_PESSOAL"] == f"{h}/Roaming/MaiSim/maisim.env",
       f"produto no Windows: o login do Claude em %APPDATA%\\MaiSim\\claude ({v['MAISIM_CLAUDE_DIR']})")
    ok(v["MAISIM_DEEPSEEK_DIR"] == f"{h}/Roaming/MaiSim/deepseek", f"produto no Windows: a pasta da DeepSeek em %APPDATA%\\MaiSim\\deepseek ({v['MAISIM_DEEPSEEK_DIR']})")
    ok(ler_config.carrega("teste")["MAISIM_CLAUDE_DIR"].endswith("maisim_teste/claude-maisim"), "no Windows, o perfil de teste continua com o dele")
    ok(ler_config.carrega("teste")["MAISIM_DEEPSEEK_DIR"].endswith("maisim_teste/deepseek-maisim"), "no Windows, o perfil de teste continua com a pasta da DeepSeek dele")
    ok(v["MAISIM_CURSOR_DIR"] == f"{h}/Roaming/MaiSim/cursor", f"produto no Windows: a casa do Cursor em %APPDATA%\\MaiSim\\cursor ({v['MAISIM_CURSOR_DIR']})")
    ok(ler_config.carrega("teste")["MAISIM_CURSOR_DIR"].endswith("maisim_teste/cursor-maisim"), "no Windows, o Cursor do perfil de teste continua com o dele")
    os.environ["MAISIM_CLAUDE_DIR"] = f"{h}/Outra"
    ok(ler_config.carrega("produto")["MAISIM_CLAUDE_DIR"] == f"{h}/Outra", "produto no Windows: MAISIM_CLAUDE_DIR escrita vale mais")
finally:
    ler_config.os = os
    del os.environ["MAISIM_CLAUDE_DIR"]
print(f"\n{17 - falhas}/17")
raise SystemExit(1 if falhas else 0)
