"""O MaiSim não trava numa janela de erro do Gecko (instância de teste: servidor 7201, motor 7204, Gecko na tela :72), achado
de Marcelo em 19/10: colou a perna do MMC abaixo da beira da folha principal (160 × 100); ao reabrir o arquivo, o Gecko
abriu "There are circuit components located outside the selected sheet size" na tela escondida dele e ficou esperando o
OK — e cada reabrir seguinte (apagar, mover em grupo, desfazer) caía na mesma janela.

Parte A (pelo servidor), a camada 1: colar e mover em grupo abaixo e à direita da beira respondem na hora, a folha
principal cresce (o rodapé do arquivo) e nada de janela; desfazer e apagar seguem.
Parte B (direto no motor, com o servidor de teste parado uns segundos), a camada 2: um arquivo com componente fora da
folha, aberto sem a camada 1 — a vigia do motor acha a janela, guarda a foto, fecha com OK, e o pedido volta.
No fim, o servidor de teste sobe de novo (reinicia_servidor_teste.sh)."""
import gzip, json, pathlib, re, subprocess, sys, time, urllib.request
from pathlib import Path
AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
B = "http://localhost:7201/maisim/simu/"
CACHE = pathlib.Path.home() / ".cache/maisim_teste"
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    t0 = time.time()
    try: r = json.loads(urllib.request.urlopen(q, timeout=180).read())
    except urllib.error.HTTPError as e: r = {"ERRO": e.code, **json.loads(e.read() or b"{}")}
    r["_s"] = time.time() - t0
    return r
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
def texto(arq):
    b = arq.read_bytes()
    return gzip.decompress(b).decode() if b[:2] == b"\x1f\x8b" else b.decode()
def rodape():
    return tuple(map(int, re.findall(r"\nworksheetSizeX (\d+)\s*\nworksheetSizeY (\d+)", texto(CACHE / "estado.ipes"))[-1]))
import janelas_gecko
ok(not janelas_gecko.janelas(":72"), "antes: nenhuma janela de erro aberta no Gecko de teste")
# ---- parte A: pelo servidor
api("editor/novo", {"modo": "descartar"})
c("CREATE", "R.1", 10, 10, "R"); c("CREATE", "SUBCIRCUIT.1", 30, 10, "SUBCIRCUIT"); c("CREATE", "SUBCIRCUIT.1#R.2", 30, 10, "R")
f0 = rodape()
api("editor/copiar", {"nomes": ["R.1", "SUBCIRCUIT.1"], "folha": "0"})
r = api("editor/colar", {"x": 20, "y": f0[1] + 80, "folha": "0"})
f1, colado = rodape(), r.get("colado") or []
ok(not r.get("ERRO") and colado and r["_s"] < 20 and not r.get("aviso_gecko") and f1[1] >= f0[1] + 80,
   f"colar em y = {f0[1] + 80} (folha {f0[0]} × {f0[1]}): colado {r.get('colado')} em {r['_s']:.1f} s; a folha cresceu para {f1[0]} × {f1[1]} {r.get('erro', '')}")
r = api("editor/grupo", {"nomes": ["R.1"], "fios": [], "folha": "0", "acao": "mover", "dx": f1[0] + 40, "dy": 0})
f2 = rodape()
x = next((e["x"] for e in r.get("folhas", {}).get("0", {}).get("elementos", []) if e["nome"] == "R.1"), None)
ok(not r.get("ERRO") and r["_s"] < 20 and x == 10 + f1[0] + 40 and f2[0] >= x, f"mover em grupo além da direita: R.1 em x = {x}, em {r['_s']:.1f} s; a folha {f2[0]} × {f2[1]} {r.get('erro', '')}")
r = api("editor/desfazer", {})
ok(not r.get("ERRO") and r["_s"] < 20, f"desfazer (o arquivo de antes, com a folha menor e tudo dentro): {r.get('desfeito')} em {r['_s']:.1f} s")
r = api("editor/grupo", {"nomes": colado, "fios": [], "folha": "0", "acao": "apagar"})
ok(not r.get("ERRO") and r["_s"] < 20 and not janelas_gecko.janelas(":72"), f"apagar o colado: em {r['_s']:.1f} s, sem janela no Gecko {r.get('erro', '')}")
# ---- parte B: a vigia, direto no motor (sem a camada 1)
modelo = texto(CACHE / "estado.ipes")
m = list(re.finditer(r"\nworksheetSizeX (\d+)\s*\nworksheetSizeY (\d+)", modelo))[-1]
fora = CACHE / "fora_da_folha.ipes"
fora.write_bytes(gzip.compress((modelo[:m.start()] + "\nworksheetSizeX 20\nworksheetSizeY 20" + modelo[m.end():]).encode()))   # o SUBCIRCUIT em x = 30 fica fora
pid = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
if pid:
    subprocess.run(["kill", pid])
    for _ in range(40):
        if ":7201 " not in subprocess.run(["ss", "-ltn"], capture_output=True, text=True).stdout: break
        time.sleep(0.25)
    time.sleep(1)
from motor import Motor
pasta = CACHE / "janelas_gecko"
antes = set(pasta.glob("*.png")) if pasta.exists() else set()
mo = Motor(7204)
mo.vigia = lambda: [t for t, _ in janelas_gecko.fecha(":72", pasta)]
t0 = time.time()
try:
    mo.cmd(f"OPEN {fora}"); erro = ""
except Exception as e:
    erro = str(e)
dt = time.time() - t0
fotos = set(pasta.glob("*.png")) - antes if pasta.exists() else set()
# quem fecha: a vigia do próprio Gecko (patch 0003, -Dmaisim.dialogos: anota o diálogo e aperta OK, sem X11) ou, num Gecko
# sem ela, a do motor pela tela (X11: a foto fica)
dlg = CACHE / "cache" / "gecko" / "dialogos.txt"           # o MAISIM_CACHE do config/teste.env
anotado = dlg.read_text(errors="replace") if dlg.exists() else ""
pelo_gecko = "Error" in anotado
ok(dt < 30 and (pelo_gecko or ("Error!" in mo.janelas and fotos)) and not janelas_gecko.janelas(":72"),
   f"sem a camada 1, o Gecko abre a janela; a vigia {'do Gecko' if pelo_gecko else 'do motor'} fecha com OK e o pedido volta em {dt:.1f} s "
   f"({anotado.strip()[:90] if pelo_gecko else f'janelas {mo.janelas}, {len(fotos)} foto(s)'}) {erro}")
dlg.unlink(missing_ok=True)
try: mo.cmd("QUIT")
except Exception: pass
fora.unlink(missing_ok=True)
for f in fotos: f.unlink(missing_ok=True)
subprocess.run(["bash", str(AQUI / "reinicia_servidor_teste.sh")])
r = api("editor/novo", {"modo": "descartar"})
ok(not r.get("ERRO"), "o servidor de teste de volta")
sys.exit(1 if falhas else 0)
