"""Os processos de fora que o simu sobe (as IAs, o login delas, o controle): num grupo próprio, para cair junto no fim.
No Linux, uma sessão nova (start_new_session) e os.killpg; no Windows, CREATE_NEW_PROCESS_GROUP (sem janela de console) e
taskkill /T (a árvore toda). Um lugar só: o resto do servidor não pergunta qual é o sistema."""
import os
import signal
import subprocess

WIN = os.name == "nt"
# os argumentos do Popen para um grupo próprio
GRUPO = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if WIN else {"start_new_session": True})


def sem_janelas():
    """No Windows, os servidores rodam sem console (pythonw): cada programa de console que eles abrem (o claude auth
    status a cada poucos segundos, o netstat, o git…) ganharia uma janela de prompt piscando. Daqui em diante, todo
    subprocess abre com CREATE_NO_WINDOW — menos quem pede um console de propósito (CREATE_NEW_CONSOLE: o login)."""
    if not WIN or getattr(subprocess.Popen, "_maisim_sem_janela", False):
        return
    original = subprocess.Popen.__init__

    def init(self, *args, **kw):
        flags = kw.get("creationflags", 0)
        if not flags & subprocess.CREATE_NEW_CONSOLE:
            kw["creationflags"] = flags | subprocess.CREATE_NO_WINDOW
        original(self, *args, **kw)
    subprocess.Popen.__init__ = init
    subprocess.Popen._maisim_sem_janela = True


sem_janelas()                                            # quem importa este módulo (o simu) já fica assim


def encerra(pid, forte=False):
    """Encerra o grupo de pid (ele e o que ele abriu); forte: sem esperar (SIGKILL / taskkill /F). Já encerrado: nada."""
    try:
        if WIN:
            subprocess.run(["taskkill", "/PID", str(pid), "/T"] + (["/F"] if forte else []),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        else:
            os.killpg(pid, signal.SIGKILL if forte else signal.SIGTERM)
    except (OSError, ProcessLookupError, subprocess.SubprocessError):
        pass
