"""Os nomes de FORA de um subcircuito não vão junto (instância de teste 7201), achado de Marcelo em 19/10: o SM-HB da
biblioteca chegava com vap, EXT_S3 e VC_SM3 (os nós do MMC de onde foi salvo) — ligado por rótulo, sem fio à vista, a
qualquer nó com esse nome. O Gecko guarda o nome de fora no bloco e nos terminais de dentro (e refaz o do bloco pelos
terminais). Confere: inserir da biblioteca (um arquivo de antes, com os nomes), colar um SM do exemplo da cascata e salvar na
biblioteca — o bloco e os terminais de dentro sem os nomes de fora; o SM original continua com os dele."""
import json, os, shutil, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
LIB = Path(os.path.expanduser("~/.cache/maisim_teste/subcircuitos")); LIB.mkdir(parents=True, exist_ok=True)
REPO = Path(__file__).resolve().parents[2] / "exemplos"
def fora(r, nome, folha="0"):
    """(rótulos de fora no bloco, rótulos de fora nos terminais de dentro) do subcircuito nome"""
    e = next(x for x in r["folhas"][folha]["elementos"] if x["nome"] == nome)
    bloco = [t.get("rotulo") for t in e["terminais"] if t.get("rotulo")]
    dentro = [s for x in r["folhas"].get(e["uid"], {"elementos": []})["elementos"] if x["tipo"] == "TERM" for s in x["saidas"] if s]
    return bloco, dentro
# 1. inserir da biblioteca um arquivo de antes (o SM-HB do Marcelo, com os nomes do MMC)
shutil.copy(REPO / "subcircuitos" / "SM-HB.ipes", LIB / "SM-HB-antigo.ipes")
api("editor/novo", {"modo": "descartar"})
r = api("editor/biblioteca", {"acao": "inserir", "nome_lib": "SM-HB-antigo", "x": 20, "y": 10, "folha": "0"})
sub = next((e["nome"] for e in r.get("folhas", {}).get("0", {}).get("elementos", []) if e["tipo"] == "SUBCIRCUIT"), None)
bl, de = fora(r, sub) if sub else (["?"], ["?"])
ok(sub and not bl and not de, f"inserido da biblioteca ({sub}): sem nomes de fora no bloco {bl} nem nos terminais de dentro {de} {r.get('erro', '')}")
# 2. colar um SM do exemplo da cascata (as células dele têm nomes de fora de verdade)
mmc0 = REPO / "exemplo_cascata_hb.ipes"                                            # subcircuitos com nomes de fora (EXT_Sk, VC_SMk)
mmc = LIB.parent / "circuitos" / "cascata_teste.ipes"                                       # o servidor só abre das pastas dele
mmc.parent.mkdir(parents=True, exist_ok=True); shutil.copy(mmc0, mmc)
r = api("editor/abrir", {"arq": str(mmc), "modo": "descartar"})
smo = next(e for e in r["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT" and fora(r, e["nome"])[0])
bl0, de0 = fora(r, smo["nome"])
api("editor/copiar", {"nome": smo["nome"], "folha": "0"})
r = api("editor/colar", {"x": smo["x"] + 40, "y": smo["y"] + 40, "folha": "0"})
novo = [e["nome"] for e in r["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT" and e["x"] == smo["x"] + 40 and e["y"] == smo["y"] + 40]
bl, de = fora(r, novo[0]) if novo else (["?"], ["?"])
bl1, de1 = fora(r, smo["nome"])
ok(novo and not bl and not de and bl1 == bl0 and de1 == de0, f"colado {smo['nome']} (que tem {bl0}): a cópia {novo} sem nomes de fora; o original com os dele")
# 3. salvar na biblioteca um SM com nomes de fora: o arquivo sai sem eles
r = api("editor/biblioteca", {"acao": "salvar", "nome": smo["nome"], "folha": "0", "nome_lib": "rotulos_teste", "sobrescrever": True})
import gzip, re
b = (LIB / "rotulos_teste.ipes").read_bytes(); t = (gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b).decode("latin-1")
achados = [x for x in bl0 if re.search(r"/" + re.escape(x) + r"(/|\s|$)", t)]
ok(not r.get("ERRO") and not achados, f"salvo na biblioteca: o arquivo não tem os nomes de fora {bl0} ({achados or 'nenhum'})")
for f in ("SM-HB-antigo.ipes", "rotulos_teste.ipes"):
    (LIB / f).unlink(missing_ok=True)
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
