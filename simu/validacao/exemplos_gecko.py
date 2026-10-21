"""Os exemplos que vêm com o GeckoCIRCUITS original (gecko/build/GeckoCIRCUITS, baixado pelo gecko/construir.sh) no
simulador, um por um, na instância de teste (8768): abre, confere o desenho (pontas soltas) e roda um trecho curto
(até 2000 passos do dt do próprio arquivo). Cada arquivo distinto vai uma vez (há cópias em pastas diferentes); a cópia
fica na pasta de circuitos do servidor de teste só durante o ensaio. Resultado: uma linha por exemplo e o resumo, e a
tabela em ~/.cache/pew_simu_teste/exemplos_gecko.json."""
import hashlib, json, math, os, shutil, sys, time, urllib.request
from pathlib import Path
B = "http://localhost:8768/pew/simu/"
RAIZ = Path(__file__).resolve().parents[2]
FONTE = RAIZ / "gecko" / "build" / "GeckoCIRCUITS"
T = Path.home() / ".cache" / "pew_simu_teste"
SALVOS = T / "pew"
def api(rota, corpo=None, espera=300):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=espera).read())
    except urllib.error.HTTPError as e:
        try: return {"ERRO": json.loads(e.read()).get("erro", e.code)}
        except Exception: return {"ERRO": e.code}
    except Exception as e: return {"ERRO": repr(e)[:200]}
if not FONTE.is_dir():
    sys.exit(f"falta {FONTE}: rode gecko/construir.sh")
vistos, arqs = set(), []
for a in sorted(FONTE.rglob("*.ipes")):
    h = hashlib.sha1(a.read_bytes()).hexdigest()
    if h not in vistos: vistos.add(h); arqs.append(a)
so = [x for x in sys.argv[1:] if not x.startswith("-")]
if so: arqs = [a for a in arqs if any(s in str(a) for s in so)]
SALVOS.mkdir(parents=True, exist_ok=True)
tabela = []
for a in arqs:
    rel = str(a.relative_to(FONTE)); cp = SALVOS / ("gx_" + a.name.replace(" ", "_"))
    shutil.copy(a, cp)
    lin = dict(arquivo=rel, abriu=False, rodou=False)
    t0 = time.time()
    r = api("editor/abrir", {"arq": str(cp), "modo": "descartar"}, 120)
    if "ERRO" in r:
        lin["erro"] = f"abrir: {r['ERRO']}"
    else:
        lin["abriu"] = True
        els = [e for f in r["folhas"].values() for e in f["elementos"]]
        lin["elementos"], lin["soltas"] = len(els), len(r.get("encaixe", {}).get("soltas", []))
        sim = r.get("simulacao") or {}
        dt = float(sim.get("dt") or 1e-6); tfim0 = float(sim.get("tfim") or 2000 * dt)
        tfim = min(tfim0, 2000 * dt); tfim = tfim if tfim > dt else 10 * dt
        lin["dt"], lin["tfim"] = dt, tfim
        j = api("editor/rodar", {"dt": repr(dt), "tfim": repr(tfim), "nome": "gx", "amostras": "500"}, 120)
        lim = time.time() + 180
        while j.get("estado") in ("rodando", "pausada", "preparando") and time.time() < lim:
            time.sleep(0.3); j = api("editor/rodada")
        if j.get("estado") in ("rodando", "pausada", "preparando"):
            api("editor/parar", {}); lin["erro"] = "rodar: passou de 3 min"
        elif "ERRO" in j or j.get("estado") != "fim":
            lin["erro"] = f"rodar: {j.get('ERRO') or j.get('erro') or j.get('estado')}"
        else:
            lin["rodou"] = True
            try:
                import numpy as np
                d = np.load(j["arquivo"], allow_pickle=True)
                canais = [k for k in d.keys() if k not in ("t", "meta")]
                lin["canais"] = len(canais)
                lin["nan"] = sorted(k for k in canais if not np.all(np.isfinite(d[k][:-1])))[:5]
            except Exception as e:
                lin["aviso"] = f"leitura da rodada: {e!r}"[:200]
    lin["s"] = round(time.time() - t0, 1)
    cp.unlink(missing_ok=True)
    for x in SALVOS.glob(cp.stem + ".*"): x.unlink(missing_ok=True)
    tabela.append(lin)
    print(("OK   " if lin["rodou"] else "FALHA"), rel, {k: v for k, v in lin.items() if k not in ("arquivo", "abriu", "rodou")}, flush=True)
api("editor/novo", {"modo": "descartar"})
(T / "exemplos_gecko.json").write_text(json.dumps(tabela, ensure_ascii=False, indent=1))
print(f"distintos: {len(tabela)} · abriram: {sum(x['abriu'] for x in tabela)} · rodaram: {sum(x['rodou'] for x in tabela)}")
