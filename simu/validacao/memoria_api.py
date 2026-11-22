"""Quanto de memória (RAM) o MaiSim usa, por processo (instância de teste: as portas do config/teste.env). Pedido de Marcelo
(21/11): "a gente não consumir muita memória RAM pra não travar o PC da turma". Por enquanto só MEDE (não falha por número):
grava o que viu em <MAISIM_DADOS>/bateria/memoria.json e no registro, para os números do Linux (a suíte de todo dia) e do
Windows (a de toda quarta, no MaiSim instalado) virarem a base de um orçamento depois. Falha só se não achar os processos.

Os processos: o que escuta em cada porta do perfil (página, simu, scope, Gecko, motor, tela do Gecko) e os filhos dele
(os do controle, o Java do Gecko que um script abriu…), mais o Xvfb da instância no Linux. A memória de cada um: no Linux o
RSS e o PSS (/proc: o PSS divide as bibliotecas compartilhadas, a soma não conta duas vezes); no Windows o working set e a
memória privada (Win32_Process). Os momentos:
1. parado (como a suíte o deixou até aqui);
2. com um circuito aberto no editor: o exemplo com controle em Python, o com controle em C, o buck sem controle;
3. o pico de cada um numa rodada longa (muitas amostras), amostrando a cada 0,25 s, e logo depois."""
import json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path[:0] = [str(AQUI), str(AQUI.parents[1] / "config")]
import ler_config  # noqa: E402

WIN = os.name == "nt"
CFG = ler_config.carrega("teste")
B = f"http://127.0.0.1:{CFG['MAISIM_PORTA_SIMU']}/maisim/simu/"
PORTAS = {"página": "MAISIM_PORTA_PAGINA", "simu": "MAISIM_PORTA_SIMU", "scope": "MAISIM_PORTA_SCOPE",
          "gecko": "MAISIM_PORTA_GECKO", "motor": "MAISIM_PORTA_MOTOR", "tela": "MAISIM_PORTA_TELA"}
MB = 1024 * 1024
# só a foto de logo depois de subir (memoria_inicio_api.py, o 1º teste da suíte): o que o MaiSim usa antes de qualquer uso
INICIO = os.environ.get("MAISIM_MEMORIA_INICIO") == "1"
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


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


def mostra(nome, f, rz=None):
    rss, priv = soma(f)
    hj = heap_java(rz) if rz else {}
    if hj:
        print("     heap do Java: " + " · ".join(f"{k} {v['heap_usado_mb']:.0f} MB usado de {v['heap_reservado_mb']:.0f} MB reservado (teto {v['teto_mb']} MB)" for k, v in hj.items()))
    det = " · ".join(f"{k} {v[0]:.0f}" + (f" ({v[2]} proc.)" if v[2] > 1 else "") for k, v in sorted(f.items(), key=lambda kv: -kv[1][0]))
    ok(True, f"{nome}: {rss:.0f} MB ({'privada' if WIN else 'PSS'} {priv:.0f} MB) — {det}")
    return {"rss_mb": rss, ("privada_mb" if WIN else "pss_mb"): priv, "heap_java": hj, "processos": {k: {"rss_mb": v[0], "outra_mb": v[1], "n": v[2]} for k, v in f.items()}}


def pico_da_rodada(rz, corpo):
    """Roda e amostra a memória a cada 0,25 s: o pico de cada processo (e o da soma), a rodada no fim."""
    r = api("editor/rodar", corpo)
    if "ERRO" in r:
        return None, r
    pico, pico_total, n = {}, 0.0, 0
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        f = foto(rz); n += 1
        for k, v in f.items():
            if v[0] > pico.get(k, (0,))[0]:
                pico[k] = v
        pico_total = max(pico_total, soma(f)[0])
        time.sleep(0.25); r = api("editor/rodada")
    return (pico, pico_total, n), r


def xmx_mb(chave):
    """O -Xmx de MAISIM_JAVA_GECKO / MAISIM_JAVA_MOTOR (config/padrao.env), em MB; None sem ele."""
    m = re.search(r"-Xmx(\d+)([kKmMgG]?)", str(CFG.get(chave) or ""))
    if not m:
        return None
    return round(int(m.group(1)) * {"k": 1 / 1024, "m": 1, "g": 1024, "": 1 / MB}[m.group(2).lower()])


res = {"sistema": "windows" if WIN else "linux", "momentos": {}}
rz = raizes()
hj0 = heap_java(rz)
if hj0:                                                   # o teto de cada Java segue a configuração (sem ela: 1/4 da RAM, ~4 GB no Actions)
    for rot, chave in (("gecko", "MAISIM_JAVA_GECKO"), ("motor", "MAISIM_JAVA_MOTOR")):
        quer, tem = xmx_mb(chave), (hj0.get(rot) or {}).get("teto_mb")
        ok(quer is not None and tem == quer, f"o teto do heap do {rot} segue {chave}: {tem} MB (pedido {quer} MB)")
elif not INICIO:
    print("     (sem o jcmd aqui — o JRE dos pacotes não tem —: o teto do heap não é conferido nesta máquina)")
ok(all(k in rz for k in ("página", "simu", "scope", "gecko", "motor")),
   f"os processos da instância de teste: {', '.join(f'{k} {v}' for k, v in rz.items())}")
if all(k in rz for k in ("simu", "gecko", "motor")) and INICIO:
    res["momentos"]["logo depois de subir"] = mostra("logo depois de subir (antes de qualquer teste)", foto(rz), rz)
    pasta = Path(CFG["MAISIM_DADOS"]).expanduser() / "bateria"
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "memoria_inicio.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
elif all(k in rz for k in ("simu", "gecko", "motor")):
    res["momentos"]["parado"] = mostra("parado (depois dos testes de tela)", foto(rz), rz)
    casos = [("com controle em Python", "exemplos/exemplo_controle_pi.ipes", "0.2", "20001"),     # o controle.py do exemplo
             ("com controle em C", "exemplos/exemplo_controle_pwm.ipes", "0.2", "20001"),         # o controle.c (e o PWM em C)
             ("sem controle (o buck)", "exemplos/exemplo_buck.ipes", "0.5", "50001")]
    for nome, arq, tfim, am in casos:
        j = api("editor/abrir", {"arq": arq, "modo": "descartar"})
        if "ERRO" in j:
            ok(False, f"{nome}: abrir {arq}: {j}"); continue
        res["momentos"][f"aberto {nome}"] = mostra(f"aberto, {nome}", foto(rz))
        p, r = pico_da_rodada(rz, {"dt": "1e-6", "tfim": tfim, "amostras": am, "nome": "memoria"})
        if p is None:
            ok(False, f"{nome}: rodar: {r}"); continue
        pico, total, n = p
        res["momentos"][f"pico {nome}"] = {**mostra(f"pico da rodada {nome} ({tfim} s, {am} amostras; {n} medidas; {r.get('estado')})", pico),
                                           "pico_soma_mb": total, "estado": r.get("estado"), "segundos": r.get("segundos")}
        res["momentos"][f"depois {nome}"] = mostra(f"logo depois da rodada {nome}", foto(rz), rz)
        ok(r.get("estado") == "fim", f"{nome}: a rodada terminou ({r.get('estado')}, {r.get('segundos')} s)")
    api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})   # o circuito de sempre da suíte
    pasta = Path(CFG["MAISIM_DADOS"]).expanduser() / "bateria"
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "memoria.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"maisim: memória gravada em {pasta / 'memoria.json'}")
raise SystemExit(1 if falhas else 0)
