"""A corrida da renovação do login (instância de teste 7201, claude de mentira), Marcelo em 21/10: o "gerar com a IA" logo
depois do F5 caiu em "Failed to refresh OAuth token: another Claude Code process is refreshing it" — a página pedia o
estado (auth status) e o uso (/usage) enquanto o pedido partia. Agora: durante um pedido, o estado e o uso respondem com o
guardado, sem outro `claude`; e o erro passageiro da renovação tenta de novo sozinho, uma vez (uma entrada só na conversa)."""
import json, os, subprocess, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF, SALVOS = Path(ENV["MAISIM_CLAUDE_DIR"]), Path(ENV["MAISIM_SALVOS"])


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def chamadas():
    f = CONF / "falso_chamadas.jsonl"
    return [json.loads(x)["args"] for x in f.read_text().splitlines()] if f.exists() else []
def espera(seg=90):
    for _ in range(int(seg / 0.4)):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.4)
    return e


dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
(CONF / "falso_logado").write_text("")
try:
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    # durante um pedido: o estado e o uso sem outro `claude`
    api("claude/estado"); api("claude/uso?forca=1")          # o guardado de antes
    (CONF / "falso_cenario").write_text("lento")
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    api("claude/pedir", {"texto": "devagar", "dt": 1e-6, "tfim": 0.002})
    time.sleep(2)
    n0 = len(chamadas())
    est, uso = api("claude/estado"), api("claude/uso?forca=1")
    time.sleep(0.5)
    novas = chamadas()[n0:]
    ok(est.get("logado") is True and "itens" in uso and not novas,
       f"pedido rodando: o estado (logado {est.get('logado')}) e o uso vêm do guardado, nenhum `claude` a mais ({novas[:1]})")
    api("claude/parar", {}); espera()
    # o erro passageiro: tenta de novo sozinho, uma vez
    (CONF / "falso_cenario").write_text("renova")
    (CONF / "falso_renovou").unlink(missing_ok=True)
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    antes = len(api("claude/pedido")["conversa"]["historico"])
    t0 = time.time()
    api("claude/pedir", {"texto": "dobre o Kp", "dt": 1e-6, "tfim": 0.002})
    e = espera()
    pedidos = [a for a in chamadas() if "-p" in a and "/usage" not in a]
    h = e["conversa"]["historico"]
    ok(len(pedidos) == 2 and len(h) == antes + 1 and h[-1].get("resposta") == "pronto" and not h[-1].get("erro")
       and any("tentando de novo" in x for x in e.get("eventos") or []),
       f"\"Failed to refresh OAuth token\": tentou de novo sozinho em {time.time() - t0:.0f} s ({len(pedidos)} chamadas), uma entrada na conversa, resposta {h[-1].get('resposta')!r}")
    # se falhar de novo, não fica tentando para sempre
    (CONF / "falso_renovou").unlink(missing_ok=True)
    (CONF / "falso_cenario").write_text("renova")
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    api("claude/pedir", {"texto": "de novo", "dt": 1e-6, "tfim": 0.002})
    time.sleep(1.5)
    (CONF / "falso_renovou").unlink(missing_ok=True)                 # a 2ª chamada também falha
    e = espera()
    pedidos = [a for a in chamadas() if "-p" in a and "/usage" not in a]
    ok(len(pedidos) == 2 and "Failed to refresh OAuth token" in (e["conversa"]["historico"][-1].get("erro") or ""),
       f"falhou de novo: para depois de 1 nova tentativa ({len(pedidos)} chamadas) e mostra o erro")
    # a trava de renovação órfã (um `claude` saiu no meio): o MaiSim tira antes de lançar — mas não se alguém usa a pasta
    trava = CONF / ".oauth_refresh.lock"
    (CONF / "falso_cenario").write_text("trava")
    trava.mkdir(exist_ok=True); os.utime(trava, (time.time() - 60, time.time() - 60))
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    api("claude/pedir", {"texto": "com a trava órfã", "dt": 1e-6, "tfim": 0.002})
    e = espera()
    pedidos = [a for a in chamadas() if "-p" in a and "/usage" not in a]
    ok(not trava.exists() and len(pedidos) == 1 and e["conversa"]["historico"][-1].get("resposta") == "pronto",
       f"trava órfã (60 s, sem dono): tirada antes de lançar, o pedido passa de primeira ({len(pedidos)} chamada)")
    trava.mkdir(exist_ok=True); os.utime(trava, (time.time() - 60, time.time() - 60))
    dono = subprocess.Popen(["sleep", "40"], env={"CLAUDE_CONFIG_DIR": str(CONF), "PATH": "/usr/bin:/bin"})
    try:
        (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
        api("claude/pedir", {"texto": "com a trava de um processo vivo", "dt": 1e-6, "tfim": 0.002})
        e = espera()
        ok(trava.exists() and "Failed to refresh OAuth token" in (e["conversa"]["historico"][-1].get("erro") or ""),
           "trava com um processo vivo usando a pasta: o MaiSim não mexe (o erro aparece, depois de tentar de novo)")
    finally:
        dono.kill()
        trava.rmdir()
finally:
    for f in ("falso_logado", "falso_cenario", "falso_renovou"):
        (CONF / f).unlink(missing_ok=True)
    api("claude/parar", {}); api("claude/descartar", {}); api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
