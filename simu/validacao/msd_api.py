"""O .msd pela API (instância de teste 7201/7202), pedido de Marcelo em 24/10 ("levar um circuito para outro MaiSim"): exportar
um circuito com controle (o exemplo_controle_pwm dos seus) e uma rodada dele; uma rodada de outro circuito é recusada;
a prévia sem o X-MaiSim é recusada, com ele mostra o conflito de nome e sugere _2; importar por cima sem confirmar é
recusado; importar como _2 grava o circuito com o controle igual e a rodada ligada ao circuito novo (no /rodadas do scope);
o token não serve duas vezes; abrir o _2 e rodar: a simulação termina."""
import io, json, time, urllib.request, zipfile
from pathlib import Path
import numpy as np
B = "http://localhost:7201/maisim/simu/"
S = "http://localhost:7202/maisim/scope/"
DADOS = Path.home() / ".cache/maisim_teste"
CIRC, RODADAS = DADOS / "circuitos", DADOS / "rodadas"
ORIG = CIRC / "exemplo_controle_pwm.ipes"
NOVO = "exemplo_controle_pwm_2"


def pede(url, dados=None, cab=None, metodo=None):
    req = urllib.request.Request(url, data=dados, headers=cab or {}, method=metodo)
    try:
        r = urllib.request.urlopen(req, timeout=300)
        return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def api(rota, corpo=None, cab=None):
    c, b, _ = pede(B + rota, json.dumps(corpo).encode() if corpo is not None else None, {"Content-Type": "application/json", **(cab or {})})
    j = json.loads(b or b"{}")
    return {"ERRO": c, **j} if c >= 400 else j


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def roda(nome):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.002", "nome": nome, "amostras": "200"})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); j = api("editor/rodada")
    return j


def apaga_novo():
    for f in CIRC.glob(f"{NOVO}.*"):
        f.unlink()


feitas = []
apaga_novo()
try:
    api("editor/abrir", {"arq": str(ORIG), "modo": "descartar"})
    j = roda("msd_t")
    ok(j.get("estado") == "fim", f"uma rodada do exemplo_controle_pwm ({j.get('estado')} {j.get('erro') or ''})")
    pasta = Path(j["arquivo"]).parent.name
    feitas.append(RODADAS / pasta)

    info = api(f"msd/info?arq={ORIG}")
    ok(".controle.json" in info.get("irmaos", []) and info.get("nome") == "exemplo_controle_pwm", f"o que vai junto: {info.get('irmaos')}")
    c, dados, cab = pede(B + f"msd/exportar?arq={ORIG}&rodadas={pasta}")
    z = zipfile.ZipFile(io.BytesIO(dados)) if c == 200 else None
    nomes = z.namelist() if z else []
    meta = json.loads(str(np.load(io.BytesIO(z.read(f"rodadas/{pasta}/scope_msd_t.npz")))["meta"])) if z else {}
    ok(c == 200 and "circuito/exemplo_controle_pwm.ipes" in nomes and "circuito/exemplo_controle_pwm.controle.json" in nomes
       and f"rodadas/{pasta}/resumo.md" in nomes and meta.get("modelo") == "exemplo_controle_pwm.ipes" and str(DADOS) not in z.read(f"rodadas/{pasta}/resumo.md").decode(),
       f"exportar: o circuito, o controle e a rodada; sem o caminho desta máquina ({c}, {len(nomes)} arquivos, {len(dados) // 1024} kB, meta.modelo {meta.get('modelo')})")
    outra = next((d.name for d in sorted(RODADAS.iterdir()) if d.is_dir() and d.name != pasta and any(d.glob("scope_*.npz"))), None)
    if outra:
        c2, b2, _ = pede(B + f"msd/exportar?arq={ORIG}&rodadas={outra}")
        ok(c2 == 409 and "erro" in json.loads(b2), f"uma rodada de outro circuito: recusada ({c2})")
    c3, _, _ = pede(B + "msd/exportar?arq=/etc/passwd")
    ok(c3 == 409, f"exportar fora das pastas do MaiSim: recusado ({c3})")

    c, b, _ = pede(B + "msd/ver", dados, {"Content-Type": "application/octet-stream"})
    ok(c == 403, f"a prévia sem o X-MaiSim: recusada ({c})")
    c, b, _ = pede(B + "msd/ver", b"PK lixo", {"Content-Type": "application/octet-stream", "X-MaiSim": "1"})
    ok(c == 400 and "erro" in json.loads(b), f"um arquivo que não é .msd: recusado ({json.loads(b).get('erro')})")
    c, b, _ = pede(B + "msd/ver", dados, {"Content-Type": "application/octet-stream", "X-MaiSim": "1"})
    pv = json.loads(b)
    ok(c == 200 and pv.get("circuito") == "exemplo_controle_pwm" and pv.get("conflito") is True and pv.get("sugerido") == NOVO
       and [r["pasta"] for r in pv.get("rodadas", [])] == [pasta] and pv.get("token"), f"a prévia: o conflito, a sugestão {pv.get('sugerido')}, a rodada")
    r = api("msd/importar", {"token": pv["token"], "nome": "exemplo_controle_pwm", "rodadas": [pasta]}, {"X-MaiSim": "1"})
    ok(r.get("ERRO") == 409 and r.get("codigo") == "confirmar" and ORIG.exists(), f"por cima sem confirmar: recusado ({r.get('erro')})")
    r = api("msd/importar", {"token": pv["token"], "nome": NOVO, "rodadas": [pasta]}, {"X-MaiSim": "1"})
    novo = CIRC / f"{NOVO}.ipes"
    feitas += [RODADAS / p for p in r.get("rodadas", [])]
    ok(r.get("arq") == novo.as_posix() and novo.exists() and (CIRC / f"{NOVO}.controle.json").read_bytes() == (CIRC / "exemplo_controle_pwm.controle.json").read_bytes()
       and r.get("rodadas") == [f"{pasta}_2"], f"importar como {NOVO}: o circuito e o controle iguais; a rodada em {r.get('rodadas')}")
    rods = json.loads(pede(S + "rodadas")[1])
    lig = [x for x in rods if x.get("modelo") == novo.as_posix()]
    ok(len(lig) == 1 and f"{pasta}_2/" in lig[0]["arq"] and lig[0]["nome"] == "msd_t", f"a rodada importada no /rodadas do scope, ligada ao circuito novo ({[x['arq'] for x in lig]})")
    rec = json.loads((DADOS / "recentes.json").read_text())
    ok(novo.as_posix() in rec, "o circuito importado entra em Recentes")
    r2 = api("msd/importar", {"token": pv["token"], "nome": "outro_nome", "rodadas": []}, {"X-MaiSim": "1"})
    ok(r2.get("ERRO") == 409 and not (CIRC / "outro_nome.ipes").exists(), f"o token não serve duas vezes ({r2.get('erro')})")

    a = api("editor/abrir", {"arq": str(novo), "modo": "descartar"})
    ctl = api("editor/controle").get("controle", {})
    j = roda("msd_t2")
    if j.get("arquivo"):
        feitas.append(Path(j["arquivo"]).parent)
    ok(not a.get("ERRO") and ctl.get("ativo") and j.get("estado") == "fim", f"abrir o {NOVO} (com o controle ativo) e rodar: {j.get('estado')} {j.get('erro') or ''}")
finally:
    import shutil
    for d in feitas:
        shutil.rmtree(d, ignore_errors=True)
    api("editor/abrir", {"arq": str(ORIG), "modo": "descartar"})
    apaga_novo()
    try:
        rec = json.loads((DADOS / "recentes.json").read_text()); rec.pop((CIRC / f"{NOVO}.ipes").as_posix(), None)
        (DADOS / "recentes.json").write_text(json.dumps(rec))
    except (OSError, ValueError):
        pass
raise SystemExit(1 if falhas else 0)
