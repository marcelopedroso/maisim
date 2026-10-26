"""As IAs do MaiSim (etapa 2 do hub de IA): o registro. Cada IA é uma peça (ia/<nome>.py, subclasse de base.IA); o servidor
pergunta aqui qual usar. O Claude, a DeepSeek (ia/deepseek.py: o mesmo Claude Code, com a chave de API da pessoa e uma
pasta só dela) e o Cursor (ia/cursor.py: o Cursor CLI oficial, listado mesmo sem o `agent` instalado, para a tela dizer como
instalar); as IAs do Google saíram na v0.3.0 (o login da conta Google por programas de terceiros arrisca suspender a
conta). Na instância de teste
(MAISIM_IA_TESTE=1), também o "Eco": o mesmo claude de mentira com outra pasta de configuração (a troca de IA no meio da
conversa) e o login por chave de API (base.ComChave: uma chave de mentira, "sk-…")."""
import os
import shutil
import time
from pathlib import Path

from .base import IA, ComChave  # noqa: F401
from .claude import Claude
from .deepseek import DeepSeek
from .cursor import Cursor, acha_cursor


class Eco(ComChave, Claude):
    """Só para teste: uma segunda IA, igual ao Claude (o claude de mentira), com outra pasta, outro nome e o login por chave
    (a janela das contas no modo da chave; o seletor de IA do chat aparece com ela e o Claude conectados). O "saldo" é de
    mentira: a barra de uso do chat e a janela mostram o da IA escolhida. Os modelos têm nomes próprios na tela e o esforço
    tem só o padrão (o seletor de esforço some), como numa IA que roda pelo Claude Code com outro serviço."""
    id = "eco"
    nome = "Eco (teste)"
    inicio_chave = "sk-"
    modelos = ("", "opus", "sonnet")
    esforcos = ("",)

    def rotulos(self):
        return {"opus": "Eco Pro", "sonnet": "Eco Flash"}

    def uso(self, forca=False):
        return {"itens": [], "saldo": {"valor": 1.84, "moeda": "USD"}, "quando": time.time()} if self.le_chave() else None


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
    ias["deepseek"] = DeepSeek(bin_claude, os.environ.get("MAISIM_DEEPSEEK_DIR") or Path.home() / ".deepseek-maisim")
    ias["deepseek"].acha = acha_claude               # o mesmo claude (instalar o Claude Code serve às duas)
    # o Cursor pelo CLI oficial (`agent`); na instância de teste, o de mentira (MAISIM_CURSOR_BIN) numa casa descartável
    pasta_cursor = os.environ.get("MAISIM_CURSOR_DIR") or (
        Path(os.environ.get("MAISIM_CLAUDE_DIR") or "/tmp/maisim-teste").with_name("cursor-maisim") if teste else Path.home() / ".cursor-maisim")
    ias["cursor"] = Cursor(acha_cursor(), pasta_cursor)
    ias["cursor"].acha = acha_cursor
    if teste:
        ias["eco"] = Eco(bin_claude, Path(os.environ.get("MAISIM_CLAUDE_DIR") or "/tmp/maisim-teste").with_name("eco-maisim"))
    return ias
