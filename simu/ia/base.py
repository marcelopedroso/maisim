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
import sys
from pathlib import Path

for _p in (Path(__file__).resolve().parents[2] / "config", Path(__file__).resolve().parents[1]):   # lingua e textos (o servidor já os põe)
    if str(_p) not in sys.path:
        sys.path.append(str(_p))
import lingua  # noqa: E402                    as mensagens no idioma do pedido
import textos  # noqa: E402,F401

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
