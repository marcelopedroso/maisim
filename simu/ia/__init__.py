"""As IAs do MaiSim (etapa 2 do hub de IA): o registro. Cada IA é uma peça (ia/<nome>.py, subclasse de base.IA); o servidor
pergunta aqui qual usar. Hoje: o Claude e o Google Antigravity (listado mesmo sem o `agy` instalado, para a tela dizer
como instalar); o Gemini CLI só na instância de teste ou com MAISIM_GEMINI_CLI=1 (o Google não atende mais contas pessoais
por ele). Na instância de teste (MAISIM_IA_TESTE=1), também o "Eco": o mesmo claude de mentira com outra pasta de
configuração (a troca de IA no meio da conversa); e o Gemini da instância de teste é o de mentira (MAISIM_GEMINI_BIN), numa
pasta descartável — nunca o ~/.gemini-maisim."""
import os
import shutil
from pathlib import Path

from .base import IA  # noqa: F401
from .claude import Claude
from .gemini import Gemini
from .antigravity import Antigravity


class Eco(Claude):
    """Só para teste: uma segunda IA, igual ao Claude (o claude de mentira), com outra pasta e outro nome."""
    id = "eco"
    nome = "Eco (teste)"


def _gemini_nvm():
    """O `gemini` do Node do nvm (o servidor pode subir com outro PATH): o da versão mais nova que tiver."""
    achados = sorted((Path.home() / ".nvm" / "versions" / "node").glob("*/bin/gemini"),
                     key=lambda p: [int(x) if x.isdigit() else 0 for x in p.parent.parent.name.lstrip("v").split(".")])
    return str(achados[-1]) if achados else ""


def registro():
    teste = os.environ.get("MAISIM_IA_TESTE") == "1"
    bin_claude = os.environ.get("MAISIM_CLAUDE_BIN") or shutil.which("claude") or str(Path.home() / ".local" / "bin" / "claude")
    ias = {"claude": Claude(bin_claude, os.environ.get("MAISIM_CLAUDE_DIR") or Path.home() / ".claude-maisim")}
    # o Google pelo Antigravity CLI (contas pessoais: grátis, Pro, Ultra); na instância de teste, o agy de mentira
    bin_agy = os.environ.get("MAISIM_AGY_BIN") or ("" if teste else shutil.which("agy") or str(Path.home() / ".local" / "bin" / "agy"))
    pasta_agy = os.environ.get("MAISIM_AGY_DIR") or (
        Path(os.environ.get("MAISIM_CLAUDE_DIR") or "/tmp/maisim-teste").with_name("agy-maisim") if teste else Path.home() / ".agy-maisim")
    ias["antigravity"] = Antigravity(bin_agy or "/nao/instalado/agy", pasta_agy)
    # o Gemini CLI: desde ~jun/2026 o Google não atende contas pessoais por ele (21/10, a conta do Marcelo): fica só na
    # instância de teste ou com MAISIM_GEMINI_CLI=1 (conta de organização, ou a chave de API — etapa 4)
    if teste or os.environ.get("MAISIM_GEMINI_CLI") == "1":
        bin_gemini = os.environ.get("MAISIM_GEMINI_BIN") or ("" if teste else shutil.which("gemini") or _gemini_nvm())
        pasta_gemini = os.environ.get("MAISIM_GEMINI_DIR") or (
            Path(os.environ.get("MAISIM_CLAUDE_DIR") or "/tmp/maisim-teste").with_name("gemini-maisim") if teste else Path.home() / ".gemini-maisim")
        ias["gemini"] = Gemini(bin_gemini or "/nao/instalado/gemini", pasta_gemini)
    if teste:
        ias["eco"] = Eco(bin_claude, Path(os.environ.get("MAISIM_CLAUDE_DIR") or "/tmp/maisim-teste").with_name("eco-maisim"))
    return ias
