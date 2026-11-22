"""Estresse de memória e de velocidade (instância de teste 7201; fora da suíte: o workflow estresse.yml, no GitHub Actions).
Pedido de Marcelo (22/11): "faça testes fudidos no Actions pra gente ver os limites… temos que ser rápidos e com pouca
memória". Leva o MaiSim ao limite e mede; grava tudo em <MAISIM_DADOS>/bateria/estresse.json. Os cenários:
1. a aula inteira: abre e roda cada exemplo de exemplos/ (com o Δt e o tempo final dele), em sequência, medindo a memória
   depois de cada um (ela vai crescendo?) e o tempo de cada rodada;
2. vazamento: o mesmo circuito (o exemplo com controle em Python) rodado VEZES vezes: a memória depois da última contra a
   depois da 5ª;
3. a rodada gigante: o exemplo do PMSM (controle em Python, a máquina) com 10× o tempo final e 200 001 amostras: o pico de
   cada processo (amostrado a cada 0,25 s), o tempo e se o Java aguentou dentro do teto;
4. o Scope com a gravação gigante: a memória do servidor do Scope ao entregá-la à página (o binário e o JSON de reserva).
Falha se uma rodada não termina, se um Java cai sem memória (OutOfMemoryError no registro) ou se o vazamento passa de
LIMITE_VAZAMENTO; os números ficam no registro e no JSON, para comparar antes e depois de cada corte."""
import gzip, json, re, sys, time, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path[:0] = [str(AQUI), str(AQUI.parents[1] / "config")]
from _memoria import CFG, WIN, raizes, foto, soma, heap_java  # noqa: E402

RAIZ = AQUI.parents[1]
B = f"http://127.0.0.1:{CFG['MAISIM_PORTA_SIMU']}/maisim/simu/"
SCOPE = f"http://127.0.0.1:{CFG['MAISIM_PORTA_SCOPE']}/maisim/scope/"
VEZES = 30
LIMITE_VAZAMENTO = 200                                   # MB a mais entre a 5ª e a última rodada do mesmo circuito
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t, flush=True)
    falhas += (not c)


def api(rota, corpo=None, base=B, bruto=False):
    req = urllib.request.Request(base + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=1800).read()
        return r if bruto else json.loads(r)
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


def simulacao(arq):                                       # o Δt e o tempo final gravados no .ipes
    txt = gzip.open(RAIZ / arq, "rt", errors="replace").read()
    return re.search(r"(?m)^dt (\S+)", txt).group(1), re.search(r"(?m)^tDURATION (\S+)", txt).group(1)


def roda(rz, arq, dt, tfim, amostras, pico=False):
    """Abre (descartando) e roda; devolve (rodada no fim, pico {processo: MB} ou None, pico da soma)."""
    j = api("editor/abrir", {"arq": arq, "modo": "descartar"})
    if "ERRO" in j:
        return j, None, 0
    r = api("editor/rodar", {"dt": dt, "tfim": tfim, "amostras": amostras, "nome": "estresse"})
    if "ERRO" in r:
        return r, None, 0
    pk, pt = {}, 0.0
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        if pico:
            f = foto(rz)
            for k, v in f.items():
                pk[k] = max(pk.get(k, 0), v[0])
            pt = max(pt, soma(f)[0])
            time.sleep(0.25)
        else:
            time.sleep(0.1)
        r = api("editor/rodada")
    return r, (pk if pico else None), pt


def linha(f):
    return " · ".join(f"{k} {v[0]:.0f}" for k, v in sorted(f.items(), key=lambda kv: -kv[1][0]))


def sem_oom():
    """Algum Java caiu sem memória? (o OutOfMemoryError no gecko.log / motor.log da instância)"""
    achados = []
    for d in {Path(CFG["MAISIM_DADOS"]).expanduser(), Path(CFG.get("MAISIM_CACHE") or CFG["MAISIM_DADOS"]).expanduser()}:
        for log in list(d.rglob("gecko.log")) + list(d.rglob("motor.log")):
            try:
                if "OutOfMemoryError" in log.read_text(errors="replace"):
                    achados.append(str(log))
            except OSError:
                pass
    return achados


res = {"sistema": "windows" if WIN else "linux", "java": {k: CFG.get(k, "") for k in ("MAISIM_JAVA_GECKO", "MAISIM_JAVA_MOTOR")}}
rz = raizes()
ok(all(k in rz for k in ("simu", "gecko", "motor", "scope")), f"os processos: {', '.join(f'{k} {v}' for k, v in rz.items())}")
print(f"     Java do Gecko: {res['java']['MAISIM_JAVA_GECKO'] or '(o padrão do Java: sem teto)'} · do motor: {res['java']['MAISIM_JAVA_MOTOR'] or '(o padrão)'}")
f0 = foto(rz); res["inicio"] = {"total_mb": soma(f0)[0], "processos": {k: v[0] for k, v in f0.items()}, "heap_java": heap_java(rz)}
ok(True, f"no começo: {soma(f0)[0]:.0f} MB — {linha(f0)}")

# 1. a aula inteira
print("== 1. a aula inteira: cada exemplo, em sequência")
aula, t_total = [], 0.0
for arq in sorted(p.relative_to(RAIZ).as_posix() for p in (RAIZ / "exemplos").glob("*.ipes")):
    dt, tfim = simulacao(arq)
    r, _, _ = roda(rz, arq, dt, tfim, "10001")
    f = foto(rz); seg = r.get("segundos") or 0; t_total += seg
    aula.append({"exemplo": Path(arq).stem, "estado": r.get("estado"), "segundos": seg, "total_mb": soma(f)[0],
                 "processos": {k: v[0] for k, v in f.items()}})
    ok(r.get("estado") == "fim", f"{Path(arq).stem}: {r.get('estado')} em {seg} s · depois: {soma(f)[0]:.0f} MB ({linha(f)})"
       + (f" — {r.get('erro') or r}" if r.get("estado") != "fim" else ""))
res["aula"] = {"exemplos": aula, "segundos_total": round(t_total, 2), "heap_java": heap_java(rz)}
cresceu = aula[-1]["total_mb"] - res["inicio"]["total_mb"] if aula else 0
ok(True, f"a aula inteira: {len(aula)} exemplos em {t_total:.1f} s de simulação; a memória foi de {res['inicio']['total_mb']:.0f} a {aula[-1]['total_mb'] if aula else 0:.0f} MB (+{cresceu:.0f} MB)")

# 2. vazamento
print(f"== 2. vazamento: o mesmo circuito {VEZES} vezes")
arq = "exemplos/exemplo_controle_pi.ipes"; dt, tfim = simulacao(arq)
apos, tempos = {}, []
for n in range(1, VEZES + 1):
    r, _, _ = roda(rz, arq, dt, tfim, "10001")
    tempos.append(r.get("segundos") or 0)
    if r.get("estado") != "fim":
        ok(False, f"rodada {n}: {r.get('estado')} — {r.get('erro') or r}"); break
    if n in (1, 5, 10, 20, VEZES):
        apos[n] = soma(foto(rz))[0]
if 5 in apos and VEZES in apos:
    d = apos[VEZES] - apos[5]
    res["vazamento"] = {"depois_de": apos, "mais_mb": round(d, 1), "tempos": tempos, "heap_java": heap_java(rz)}
    ok(d <= LIMITE_VAZAMENTO, f"a memória depois de 1, 5, 10, 20 e {VEZES} rodadas: {', '.join(f'{v:.0f}' for v in apos.values())} MB "
       f"(+{d:.0f} MB da 5ª à {VEZES}ª; limite {LIMITE_VAZAMENTO}); o tempo da 1ª {tempos[0]} s, da última {tempos[-1]} s")

# 3. a rodada gigante
print("== 3. a rodada gigante: o PMSM com 10× o tempo final e 200 001 amostras")
arq = "exemplos/exemplo_pmsm.ipes"; dt, tfim = simulacao(arq)
tfim10 = repr(float(tfim) * 10)
antes = soma(foto(rz))[0]
r, pk, pt = roda(rz, arq, dt, tfim10, "200001", pico=True)
gigante = r.get("arquivo")
res["gigante"] = {"tfim": tfim10, "estado": r.get("estado"), "segundos": r.get("segundos"), "pico_soma_mb": pt, "pico_processos": pk,
                  "antes_mb": antes, "depois_mb": soma(foto(rz))[0], "heap_java": heap_java(rz)}
ok(r.get("estado") == "fim", f"o PMSM com tfim {tfim10} s ({float(tfim10) / float(dt):.0f} passos, 200 001 amostras): {r.get('estado')} em {r.get('segundos')} s"
   + (f" — {r.get('erro') or r}" if r.get("estado") != "fim" else ""))
ok(True, f"o pico: {pt:.0f} MB no total — " + " · ".join(f"{k} {v:.0f}" for k, v in sorted((pk or {}).items(), key=lambda kv: -kv[1]))
   + f"; antes {antes:.0f} MB, depois {res['gigante']['depois_mb']:.0f} MB")
hj = res["gigante"]["heap_java"]
if hj:
    print("     heap do Java depois: " + " · ".join(f"{k} {v['heap_usado_mb']:.0f} MB usado de {v['heap_reservado_mb']:.0f} reservado (teto {v['teto_mb']})" for k, v in hj.items()))

# 4. o Scope com a gravação gigante
print("== 4. o Scope com a gravação gigante")
if gigante:
    s0 = foto(rz).get("scope", (0,))[0]
    t0 = time.time(); b = api("rodada.bin?arq=" + urllib.request.quote(str(gigante)), base=SCOPE, bruto=True); tb = time.time() - t0
    s1 = foto(rz).get("scope", (0,))[0]
    t0 = time.time(); j = api("rodada?arq=" + urllib.request.quote(str(gigante)), base=SCOPE); tj = time.time() - t0
    s2 = foto(rz).get("scope", (0,))[0]
    tam = len(b) if isinstance(b, (bytes, bytearray)) else 0
    res["scope"] = {"antes_mb": s0, "depois_bin_mb": s1, "depois_json_mb": s2, "bin_mb": round(tam / 1048576, 1), "bin_s": round(tb, 2), "json_s": round(tj, 2)}
    ok(tam > 0 and "ERRO" not in (j if isinstance(j, dict) else {}),
       f"o Scope entregou a gravação gigante: o binário ({tam / 1048576:.1f} MB) em {tb:.1f} s e o JSON em {tj:.1f} s; o servidor do Scope foi de {s0:.0f} a {s1:.0f} MB (binário) e {s2:.0f} MB (JSON)")
else:
    ok(False, "sem a gravação gigante para o Scope")

oom = sem_oom()
ok(not oom, "nenhum Java caiu sem memória (OutOfMemoryError)" + (f": {oom}" if oom else ""))
res["fim"] = {"total_mb": soma(foto(rz))[0], "heap_java": heap_java(rz)}
pasta = Path(CFG["MAISIM_DADOS"]).expanduser() / "bateria"
pasta.mkdir(parents=True, exist_ok=True)
(pasta / "estresse.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"maisim: estresse gravado em {pasta / 'estresse.json'}")
raise SystemExit(1 if falhas else 0)
