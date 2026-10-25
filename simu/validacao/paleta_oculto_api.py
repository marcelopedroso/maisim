"""Os componentes fora da paleta (catalogo_gecko.py, ESCONDIDOS → "oculto" no catalogo.json; instância de teste 7201): a
paleta não os oferece, mas um circuito que já os tem abre, desenha e roda. Monta um com três deles (a ponte com o
Simulink, ToEXT e FromEXT, e o modulador de PMSM) e um CONST, salva, abre de novo (descartando) e confere os elementos
no estado; roda 100 µs. O mesmo com os de 25/10 (v0.3.1): as janelas SV e UZI do Gecko, o CISPR16, os medidores e os
elementos da relutância, a máquina de indução IM e a LISN. Se houver o código do Gecko (gecko/build/GeckoCIRCUITS, o do gecko/construir.sh), abre também o
exemplo dele da ponte com o Simulink (resources/GeckoSimulink/vr1_simulink.ipes), copiado para a pasta de circuitos."""
import json, shutil, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
RAIZ = Path(__file__).resolve().parents[2]
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
cat = json.loads((RAIZ / "simu/static/catalogo.json").read_text())
ocultos = {i["id"] for a in cat["abas"] for i in a["itens"] if i.get("oculto")}
NOVOS = {"CISPR16", "SV", "UZI", "MMF_MEAS", "FLUX", "Rel", "NLRel", "MMF", "LRel", "SM-SAL", "SM-RO", "IM", "IM-SAT", "LISN"}   # 25/10
ok({"ToEXT", "FromEXT", "DataExport", "FILE", "JAVA", "C DLL", "ANALYSIS", "SPARSEMATRIX", "PMSM_CTRL", "PMSM_MOD"} | NOVOS <= ocultos
   and not ocultos & {"ABCDQ", "DQABC", "TIME", "TEXT", "THYRISTOR_CONTROL", "RANDOM", "SIGNAL", "M-DC", "PM-DC", "PMSM", "IM-CAGE", "VIEWMOT", "FLOW", "TEMP"},
   f"no catálogo, fora da paleta: {sorted(ocultos)}")
rel = next(a for a in cat["abas"] if a["aba"] == "Reluctance")
vm = next(i for a in cat["abas"] for i in a["itens"] if i["id"] == "VIEWMOT")
ok(all(i.get("oculto") for i in rel["itens"]) and vm.get("rotulo") == "simu.cmp_viewmot",
   f"a aba Reluctance toda oculta ({[i['id'] for i in rel['itens']]}); o VIEWMOT com o rótulo do MaiSim ({vm.get('rotulo')})")
SALVOS = Path.home() / ".cache/maisim_teste/circuitos"
nomes = lambda r: {e["nome"] for f in (r.get("folhas") or {}).values() for e in f.get("elementos", [])}
api("editor/novo", {"modo": "descartar"})
for a in (["ToEXT.1", 10, 10, "ToEXT"], ["FromEXT.1", 20, 10, "FromEXT"], ["PMSM_MOD.1", 30, 10, "PMSM_MOD"], ["CONST.1", 10, 20, "CONST"]):
    r = api("editor/cmd", {"op": "CREATE", "args": a})
    ok(not r.get("erro") and a[0] in nomes(r), f"{a[3]} entra pela API (o caminho da paleta): {r.get('erro') or 'ok'}")
r = api("editor/salvar", {"nome": "paleta_oculto", "pasta": "circuitos", "sobrescrever": True})
ok("ERRO" not in r, f"salvo: {r.get('erro') or r.get('arq')}")
r = api("editor/abrir", {"arq": str(SALVOS / "paleta_oculto.ipes"), "modo": "descartar"})
ok("ERRO" not in r and {"ToEXT.1", "FromEXT.1", "PMSM_MOD.1"} <= nomes(r), f"aberto de novo, com os três (desenhados no estado): {r.get('erro') or sorted(nomes(r))}")
r = api("editor/rodar", {"dt": "1e-06", "tfim": "0.0001", "nome": "paleta_oculto", "amostras": "20"})
for _ in range(200):
    if r.get("estado") not in ("preparando", "rodando", "pausada"): break
    time.sleep(0.3); r = api("editor/rodada")
ok(r.get("estado") == "fim", f"roda (100 µs): {r.get('estado')} {r.get('erro') or ''}")
# os de 25/10: as janelas do Gecko (SV, UZI), o receptor de EMI, a relutância e os seus medidores, a IM e a LISN, soltos
api("editor/novo", {"modo": "descartar"})
NOVOS_EL = ["SV", "UZI", "CISPR16", "MMF_MEAS", "FLUX", "Rel", "MMF", "IM", "LISN", "CONST"]
for k, t in enumerate(NOVOS_EL):
    r = api("editor/cmd", {"op": "CREATE", "args": [f"{t}.1", 10 + 6 * k, 10, t]})
    ok(not r.get("erro") and f"{t}.1" in nomes(r), f"{t} entra pela API: {r.get('erro') or 'ok'}")
r = api("editor/salvar", {"nome": "paleta_oculto2", "pasta": "circuitos", "sobrescrever": True})
r = api("editor/abrir", {"arq": str(SALVOS / "paleta_oculto2.ipes"), "modo": "descartar"})
ok("ERRO" not in r and {f"{t}.1" for t in NOVOS_EL} <= nomes(r), f"salvo e aberto de novo, com todos: {r.get('erro') or sorted(nomes(r))}")
r = api("editor/rodar", {"dt": "1e-06", "tfim": "0.0001", "nome": "paleta_oculto2", "amostras": "20"})
for _ in range(200):
    if r.get("estado") not in ("preparando", "rodando", "pausada"): break
    time.sleep(0.3); r = api("editor/rodada")
ok(r.get("estado") == "fim", f"roda (100 µs): {r.get('estado')} {r.get('erro') or ''}")
ex = RAIZ / "gecko/build/GeckoCIRCUITS/resources/GeckoSimulink/vr1_simulink.ipes"
if ex.is_file():
    shutil.copy(ex, SALVOS / "paleta_oculto_simulink.ipes")
    r = api("editor/abrir", {"arq": str(SALVOS / "paleta_oculto_simulink.ipes"), "modo": "descartar"})
    tipos = {e.get("tipo") for f in (r.get("folhas") or {}).values() for e in f.get("elementos", [])}
    ok("ERRO" not in r and {"ToEXT", "FromEXT"} & {n.split(".")[0] for n in nomes(r)}, f"o exemplo do Gecko com a ponte do Simulink abre: {r.get('erro') or sorted(tipos - {None})}")
else:
    print("(sem o código do Gecko em gecko/build/GeckoCIRCUITS: o exemplo dele fica de fora)")
api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
for n in ("paleta_oculto.ipes", "paleta_oculto2.ipes", "paleta_oculto_simulink.ipes"):
    (SALVOS / n).unlink(missing_ok=True)
print(f"\n{'OK' if not falhas else 'FALHA'}: {falhas} falha(s)")
raise SystemExit(1 if falhas else 0)
