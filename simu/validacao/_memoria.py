"""A memória dos processos do MaiSim, nos dois sistemas (Linux: /proc; Windows: Win32_Process), para memoria_api.py e
estresse_api.py: os processos da instância de teste pelas portas do perfil (e os filhos deles), o RSS/PSS ou o working
set/memória privada de cada um, e o heap dos Javas pelo jcmd onde houver."""
import os, re, shutil, subprocess, sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path[:0] = [str(AQUI), str(AQUI.parents[1] / "config")]
import ler_config  # noqa: E402

WIN = os.name == "nt"
CFG = ler_config.carrega("teste")
PORTAS = {"página": "MAISIM_PORTA_PAGINA", "simu": "MAISIM_PORTA_SIMU", "scope": "MAISIM_PORTA_SCOPE",
          "gecko": "MAISIM_PORTA_GECKO", "motor": "MAISIM_PORTA_MOTOR", "tela": "MAISIM_PORTA_TELA"}
MB = 1024 * 1024


# ---- os processos e a memória deles, nos dois sistemas ----
def tabela():
    """{pid: (ppid, nome, rss_bytes, privada_ou_pss_bytes)} de todos os processos."""
    t = {}
    if WIN:
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.WorkingSetSize)`t$($_.PrivatePageCount)\" }"],
                           capture_output=True, text=True, timeout=120).stdout
        for l in r.splitlines():
            c = l.split("\t")
            if len(c) == 5 and c[0].isdigit():
                t[int(c[0])] = (int(c[1] or 0), c[2], int(c[3] or 0), int(c[4] or 0))
        return t
    for d in Path("/proc").iterdir():
        if not d.name.isdigit():
            continue
        try:
            st = (d / "stat").read_text()
            nome, resto = st[st.index("(") + 1:st.rindex(")")], st[st.rindex(")") + 2:].split()
            rss = int(re.search(r"VmRSS:\s+(\d+)", (d / "status").read_text()).group(1)) * 1024
            try:
                pss = int(re.search(r"Pss:\s+(\d+)", (d / "smaps_rollup").read_text()).group(1)) * 1024
            except (OSError, AttributeError):
                pss = rss
            t[int(d.name)] = (int(resto[1]), nome, rss, pss)
        except (OSError, ValueError, AttributeError, IndexError):
            pass                                          # sumiu no meio, ou é de outro usuário / sem memória (kernel)
    return t


def pid_na_porta(porta):
    if WIN:
        r = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
        for l in r.splitlines():
            c = l.split()
            if len(c) >= 5 and c[3].upper() == "LISTENING" and re.search(rf"[:.]{porta}$", c[1]):
                return int(c[4])
        return None
    r = subprocess.run(["ss", "-ltnpH", f"sport = :{porta}"], capture_output=True, text=True).stdout
    m = re.search(r"pid=(\d+)", r)
    return int(m.group(1)) if m else None


def raizes():
    """{rótulo: pid} dos processos da instância (as portas e, no Linux, o Xvfb)."""
    out = {}
    for rot, k in PORTAS.items():
        p = pid_na_porta(int(CFG[k]))
        if p:
            out[rot] = p
    if not WIN:
        tela = str(CFG.get("MAISIM_TELA_X", "")).strip()
        for d in Path("/proc").iterdir():
            try:
                if d.name.isdigit() and tela and (d / "cmdline").read_bytes().split(b"\0")[:2] == [b"Xvfb", tela.encode()]:
                    out["xvfb"] = int(d.name)
            except OSError:
                pass
    return out


def foto(rz):
    """{rótulo: (rss_MB, privada_MB, n_processos)}: cada raiz com os descendentes dela (sem contar duas vezes um processo)."""
    t = tabela()
    filhos = {}
    for pid, (pp, *_r) in t.items():
        filhos.setdefault(pp, []).append(pid)
    vistos, out = set(), {}
    for rot, raiz in rz.items():
        pilha, rss, priv, n = [raiz], 0, 0, 0
        while pilha:
            p = pilha.pop()
            if p in vistos or p not in t:
                continue
            vistos.add(p)
            rss += t[p][2]; priv += t[p][3]; n += 1
            pilha.extend(filhos.get(p, []))
        out[rot] = (round(rss / MB, 1), round(priv / MB, 1), n)
    return out


def heap_java(rz):
    """O heap de cada Java (Gecko, motor): usado e reservado (committed), pelo jcmd (o do JDK; o JRE dos pacotes não tem):
    o quanto um teto (-Xmx) economizaria sem faltar. {} sem jcmd."""
    jcmd, out = shutil.which("jcmd"), {}
    if not jcmd:
        return out
    for rot in ("gecko", "motor"):
        if rot not in rz:
            continue
        try:
            txt = subprocess.run([jcmd, str(rz[rot]), "GC.heap_info"], capture_output=True, text=True, timeout=30).stdout
            m = re.search(r"total (\d+)K, used (\d+)K", txt)
            mx = subprocess.run([jcmd, str(rz[rot]), "VM.flags"], capture_output=True, text=True, timeout=30).stdout
            teto = re.search(r"MaxHeapSize=(\d+)", mx)
            if m:
                out[rot] = {"heap_usado_mb": round(int(m.group(2)) / 1024, 1), "heap_reservado_mb": round(int(m.group(1)) / 1024, 1),
                            "teto_mb": round(int(teto.group(1)) / MB) if teto else None}
        except (OSError, subprocess.SubprocessError):
            pass
    return out


def soma(f):
    return round(sum(v[0] for v in f.values()), 1), round(sum(v[1] for v in f.values()), 1)


