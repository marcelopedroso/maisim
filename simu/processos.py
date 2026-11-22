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


def vivo(pid):
    """O processo pid existe? No Windows não pode ser o os.kill(pid, 0) do Linux: lá o sinal 0 é o CTRL_C_EVENT, e o
    os.kill manda um Ctrl+C de verdade para o grupo do console (na suíte no Windows, derrubou quem rodava os testes).
    Lá: OpenProcess e o código de saída (STILL_ACTIVE), sem abrir outro programa."""
    if not pid:
        return False
    if WIN:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, int(pid))         # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        try:
            codigo = ctypes.c_ulong()
            return bool(k.GetExitCodeProcess(h, ctypes.byref(codigo))) and codigo.value == 259   # STILL_ACTIVE
        finally:
            k.CloseHandle(h)
    try:
        os.kill(int(pid), 0)
        return True
    except PermissionError:                              # existe, de outro usuário
        return True
    except (OSError, ProcessLookupError, ValueError):
        return False


def encerra(pid, forte=False):
    """Encerra o grupo de pid (ele e o que ele abriu); forte: sem esperar (SIGKILL / taskkill /F). Já encerrado: nada.
    No Windows é sempre o /F: sem ele o taskkill só manda o "feche a janela" (WM_CLOSE), que um programa de console sem
    janela (o claude.exe, o worker do controle: todos sobem com CREATE_NO_WINDOW) não recebe, e o processo seguia vivo
    (o Parar de um pedido à IA não parava nada). Um Ctrl+Break também não serve: o servidor não tem o console dele."""
    try:
        if WIN:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        else:
            os.killpg(pid, signal.SIGKILL if forte else signal.SIGTERM)
    except (OSError, ProcessLookupError, subprocess.SubprocessError):
        pass
