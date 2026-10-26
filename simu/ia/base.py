"""A IA como peça trocável do MaiSim (etapa 2 do hub de IA; plano de 21/10 em ~/.claude/plans/expressive-painting-peacock.md).

O MaiSim monta a pasta de trabalho (CONTEXTO.md, o controle, a rodada, os anexos, a memória, os contextos salvos, CONVERSA.md)
e guarda a conversa no seu próprio registro: isso é igual para qualquer IA. O que muda de uma IA para outra fica aqui:
  como chamar a ferramenta dela (o comando de um pedido, de um resumo, do estado do login e do uso), onde fica a pasta de
  configuração (o login, isolado do resto da máquina), se a sessão de uma conversa já existe, e como ler o que ela escreve
  (traduz → os eventos comuns abaixo, que o servidor entende sem saber de qual IA vieram), e o login de uma IA que não é o
  Claude (o do Claude continua no servidor, como sempre foi): estado, entrar (o link), o código colado, cancelar, sair.

Eventos comuns (traduz devolve uma lista):
  {"tipo": "inicio", "modelo": str}
  {"tipo": "texto", "texto": str}
  {"tipo": "ferramenta", "nome": str, "entrada": dict}
  {"tipo": "recusa", "msg": str}
  {"tipo": "resultado", "erro": bool, "texto": str | None, "erros": [str], "subtipo": str | None, "limite_passos": bool,
   "uso": {entrada, saida}, "turnos": int | None, "ms": int | None, "custo": float | None, "negados": [{nome, entrada}],
   "modelo": str | None}
"""
import os
import re
import shutil
import sys
from pathlib import Path

for _p in (Path(__file__).resolve().parents[2] / "config", Path(__file__).resolve().parents[1]):   # lingua e textos (o servidor já os põe)
    if str(_p) not in sys.path:
        sys.path.append(str(_p))
import lingua  # noqa: E402                    as mensagens no idioma do pedido
import textos  # noqa: E402,F401

# fora do Windows, o botão Instalar roda o instalador oficial de cada ferramenta (o Claude Code, o Cursor CLI) com a casa
# (HOME) nesta pasta só do MaiSim: o programa fica dentro do universo do MaiSim (~/.maisim-ferramentas/.local/bin), sem
# mexer na pasta pessoal nem no PATH de quem usa; quem já tem a ferramenta instalada continua com a dela
FERRAMENTAS = Path(os.environ.get("MAISIM_FERRAMENTAS") or Path.home() / ".maisim-ferramentas")


def instalador_unix(cmd):
    """O comando do instalador oficial (curl … | bash) rodando com HOME = FERRAMENTAS (os XDG_* de quem usa ficam de fora,
    para o instalador não escrever na pasta pessoal por eles)."""
    return ["env", "-u", "XDG_DATA_HOME", "-u", "XDG_CONFIG_HOME", "-u", "XDG_BIN_HOME", "-u", "XDG_CACHE_HOME",
            f"HOME={FERRAMENTAS}", "bash", "-c", f'mkdir -p "$HOME" && {cmd}']


def acha_unix(nome):
    """A ferramenta fora do Windows: a do PATH, a do instalador oficial na pasta pessoal (~/.local/bin) ou a que o botão
    Instalar pôs na pasta do MaiSim; nenhuma: o lugar do botão (procurado de novo depois de instalar)."""
    for c in (shutil.which(nome), Path.home() / ".local" / "bin" / nome, FERRAMENTAS / ".local" / "bin" / nome):
        if c and Path(c).exists():
            return str(c)
    return str(FERRAMENTAS / ".local" / "bin" / nome)


ENV_BRANCA = ("PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR")
# no Windows, também as do sistema e da pessoa: sem SYSTEMROOT a rede e a criptografia não sobem, sem USERPROFILE/APPDATA a
# ferramenta não acha a casa, sem TEMP não tem onde escrever (o os.environ do Windows já vem com os nomes em maiúsculas)
if os.name == "nt":
    ENV_BRANCA += ("SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA",
                   "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "COMMONPROGRAMFILES",
                   "TEMP", "TMP", "USERNAME", "USERDOMAIN", "COMPUTERNAME", "OS", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS")


class IA:
    id = ""                       # "claude", …
    nome = ""                     # como aparece na tela
    variavel_pasta = ""           # a variável de ambiente que aponta a pasta de configuração da ferramenta
    modelos = ("",)               # "" = o padrão da conta
    esforcos = ("",)
    tem_login = False             # o login é pelo MaiSim (estado/entra/codigo/sai abaixo); o do Claude é o do servidor
    modo_login = ""               # como a tela mostra o login: "" (link e código colado) ou "chave" (a chave de API colada: ComChave)
    acha = None                   # () → o caminho da ferramenta: procurado de novo enquanto ela não existe (instalada depois)

    def __init__(self, binario, pasta):
        self.bin = str(binario)
        self.pasta = Path(pasta).resolve()

    # ---- o ambiente do processo filho: lista branca + a pasta de configuração do MaiSim (nenhuma chave de outra IA vaza)
    def ambiente(self, **extra):
        env = {k: os.environ[k] for k in ENV_BRANCA if k in os.environ}
        if self.variavel_pasta:
            env[self.variavel_pasta] = str(self.pasta)
        env.update({"NO_COLOR": "1", "TERM": "dumb", **extra})   # extra pode trocar o TERM
        return env

    def instalado(self):
        if self.acha and not Path(self.bin).exists():
            self.bin = str(self.acha())
        return Path(self.bin).exists()

    def comando_instala(self):
        """O comando do instalador oficial da ferramenta (o botão Instalar da janela das contas, que o servidor roda em segundo
        plano), ou None: sem botão (a tela mostra o comando para o terminal)."""
        return None

    # ---- o que cada IA define
    # pasta = a pasta de trabalho (cwd do processo): uma IA que recebe as regras ou a política por arquivo as
    # grava aqui, antes de devolver o comando
    def comando(self, prompt, sessao, retoma, regras, modelo="", esforco="", passos=100, editaveis=(), pasta=None):
        raise NotImplementedError

    def comando_resumo(self, prompt, modelo="", esforco="", pasta=None):
        raise NotImplementedError

    def sessao_existe(self, sid):
        return False

    def traduz(self, ev, estado=None):
        """estado: um dicionário por chamada (o mesmo em todas as linhas dela), para a IA que manda o texto em pedaços."""
        raise NotImplementedError

    def le_resultado_json(self, ev):
        """O resultado de uma chamada de saída única (o resumo): o mesmo formato do evento "resultado"."""
        out = self.traduz(ev)
        return next((e for e in out if e["tipo"] == "resultado"), None)

    def trava_login(self):
        """A trava de renovação do login da ferramenta (uma pasta), se ela tiver uma; None se não."""
        return None

    def erro_passageiro(self, texto):
        """O erro é passageiro (vale tentar de novo uma vez sozinho)?"""
        return False

    def erro_conhecido(self, texto):
        """Um erro da ferramenta que a peça sabe explicar (a mensagem para a tela), ou None."""
        return None

    def rotulos(self):
        """Os nomes dos modelos para a tela ({apelido: nome}); vazio = a tela usa os apelidos."""
        return {}

    painel_uso = None             # a página do uso na conta, quando a ferramenta não o informa (a tela aponta para ela)

    def uso(self, forca=False):
        """Os limites da conta ({"itens": [{rotulo, pct usado, renova}], "quando"}), se a ferramenta informar; None se não."""
        return None

    def ao_iniciar(self):
        """Quando o servidor sobe (em segundo plano): a peça pode pôr em dia o que precisar (a lista de modelos)."""

    # ---- o login de uma IA que não é o Claude (o servidor chama; ValueError vira a mensagem da tela)
    def estado(self):
        """{"instalado", "logado", "email", "metodo", "pasta", "login": {andamento, url, erro, mensagem, desde} | None}"""
        return {"instalado": self.instalado(), "logado": False}

    def entra(self):
        raise ValueError(lingua.tr("ia_conta.login_nao_existe", nome=self.nome))

    def codigo(self, codigo):
        raise ValueError(lingua.tr("ia_conta.sem_login_andamento", nome=self.nome))

    def cancela(self):
        pass

    def sai(self):
        raise ValueError(lingua.tr("ia_conta.login_nao_existe", nome=self.nome))


class ComChave:
    """O login por chave de API (modo_login "chave"), para pôr antes da IA na herança: class X(ComChave, Claude). A pessoa cola
    a chave na janela das contas; o MaiSim a guarda num arquivo só dela (0600) dentro da pasta de configuração da IA
    (<pasta>/maisim/chave) e só a usa no ambiente do processo dessa IA. A chave nunca volta para a página (o estado só leva o
    começo e os 4 últimos caracteres), nunca vai para um registro, para o histórico nem para a pasta da conversa, e nenhuma
    mensagem de erro a repete."""
    tem_login = True
    modo_login = "chave"
    forma_chave = re.compile(r"[A-Za-z0-9_.\-]{16,400}")   # a forma de uma chave (sem espaços); cada IA pode apertar
    inicio_chave = ""                                      # o começo de toda chave dela ("sk-"), para a mensagem de erro

    def arquivo_chave(self):
        return self.pasta / "maisim" / "chave"

    def le_chave(self):
        """A chave guardada (só para o ambiente do processo da IA), ou None."""
        try:
            k = self.arquivo_chave().read_text().strip()
        except OSError:
            return None
        return k or None

    def mascara(self, k):
        """O que a tela pode ver da chave: o começo ("sk-", se houver) e os 4 últimos caracteres."""
        if not k:
            return None
        ini = k[:k.index("-") + 1] if "-" in k[:5] else ""
        return f"{ini}{'•' * 10}{k[-4:]}"

    def confere_chave(self, k):
        """A forma da chave (sem rede); ValueError com a mensagem da tela, sem repetir a chave."""
        if not self.forma_chave.fullmatch(k) or (self.inicio_chave and not k.startswith(self.inicio_chave)):
            raise ValueError(lingua.tr("ia_conta.chave_forma_inicio", nome=self.nome, inicio=self.inicio_chave) if self.inicio_chave
                             else lingua.tr("ia_conta.chave_forma", nome=self.nome))

    def valida_chave(self, k):
        """Confere se a chave vale (uma chamada barata ao serviço), se a IA souber; ValueError se não vale. Padrão: nada."""

    def guarda_chave(self, k):
        d = self.arquivo_chave().parent
        tmp = d / ".chave.nova"
        try:
            d.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(d, 0o700)
            tmp.unlink(missing_ok=True)
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)   # nasce 0600 (nunca legível por outros, nem um instante)
            with os.fdopen(fd, "w") as f:
                f.write(k + "\n")
            os.replace(tmp, self.arquivo_chave())
            os.chmod(self.arquivo_chave(), 0o600)
        except OSError as e:                             # a mensagem do sistema (o caminho), nunca a chave
            tmp.unlink(missing_ok=True)
            raise ValueError(lingua.tr("ia_conta.chave_nao_gravou", nome=self.nome, erro=e.strerror or type(e).__name__))

    def estado(self):
        k = self.le_chave()
        return {"instalado": self.instalado(), "logado": bool(k), "metodo": "chave", "chave": self.mascara(k),
                "pasta": str(self.pasta).replace(str(Path.home()), "~", 1)}

    def entra(self):                                     # não há o que abrir: a tela já mostra o campo da chave
        raise ValueError(lingua.tr("ia_conta.chave_cole", nome=self.nome))

    def codigo(self, codigo):
        """A chave colada: confere a forma, confere com o serviço (se a IA souber) e guarda."""
        k = re.sub(r"\s+", "", str(codigo or ""))
        if not k:
            raise ValueError(lingua.tr("ia_conta.chave_vazia", nome=self.nome))
        self.confere_chave(k)
        self.valida_chave(k)
        self.guarda_chave(k)
        return self.estado()

    def cancela(self):
        pass

    def sai(self):
        try:
            self.arquivo_chave().unlink(missing_ok=True)
        except OSError as e:
            raise ValueError(lingua.tr("ia_conta.chave_nao_apagou", nome=self.nome, erro=e.strerror or type(e).__name__))
        return self.estado()
