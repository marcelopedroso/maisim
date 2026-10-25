"""As IAs do MaiSim (etapa 2 do hub de IA): o registro. Cada IA é uma peça (ia/<nome>.py, subclasse de base.IA); o servidor
pergunta aqui qual usar. Hoje só o Claude (as IAs do Google saíram na v0.3.0: o login da conta Google por
programas de terceiros arrisca suspender a conta; outras IAs ficam para o roadmap). Na instância de teste
(MAISIM_IA_TESTE=1), também o "Eco": o mesmo claude de mentira com outra pasta de configuração (a troca de IA no meio da
conversa)."""
import os
import shutil
from pathlib import Path

from .base import IA  # noqa: F401
from .claude import Claude


class Eco(Claude):
    """Só para teste: uma segunda IA, igual ao Claude (o claude de mentira), com outra pasta e outro nome."""
    id = "eco"
    nome = "Eco (teste)"


def acha_claude():
    """O `claude`: MAISIM_CLAUDE_BIN (testes), o do PATH, ou o lugar do instalador oficial (~/.local/bin/claude). No Windows,
    só o claude.exe (o nativo): o claude.cmd de um `npm install -g` passaria o pedido pelo cmd.exe, que lê & | < > " e as
    quebras de linha do texto (o pedido e as regras não chegariam inteiros); e o %USERPROFILE%\\.local\\bin\\claude.exe é
    procurado pelo caminho, porque o instalador o põe no PATH novo, não no do MaiSim que já estava aberto."""
    if os.environ.get("MAISIM_CLAUDE_BIN"):
        return os.environ["MAISIM_CLAUDE_BIN"]
    if os.name == "nt":
        casa = Path(os.environ.get("USERPROFILE") or Path.home())
        return shutil.which("claude.exe") or str(casa / ".local" / "bin" / "claude.exe")
    return shutil.which("claude") or str(Path.home() / ".local" / "bin" / "claude")


def registro():
    teste = os.environ.get("MAISIM_IA_TESTE") == "1"
    bin_claude = acha_claude()
    ias = {"claude": Claude(bin_claude, os.environ.get("MAISIM_CLAUDE_DIR") or Path.home() / ".claude-maisim")}
    ias["claude"].acha = acha_claude                 # instalado depois (o botão Instalar, ou à mão): procura de novo, sem reiniciar
    if teste:
        ias["eco"] = Eco(bin_claude, Path(os.environ.get("MAISIM_CLAUDE_DIR") or "/tmp/maisim-teste").with_name("eco-maisim"))
    return ias
