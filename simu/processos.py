"""Os processos de fora que o simu sobe (as IAs, o login delas, o controle): num grupo próprio, para cair junto no fim.
No Linux, uma sessão nova (start_new_session) e os.killpg; no Windows, CREATE_NEW_PROCESS_GROUP (sem janela de console) e
taskkill /T (a árvore toda). Um lugar só: o resto do servidor não pergunta qual é o sistema."""
import os
import signal
import subprocess

WIN = os.name == "nt"
# os argumentos do Popen para um grupo próprio
GRUPO = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if WIN else {"start_new_session": True})


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
