"""A instalação do Claude Code pela janela das contas, na instância de teste (7201, Linux, sem MAISIM_INSTALA_CLAUDE_CMD): as
rotas só para a página do MaiSim (X-MaiSim no POST; Host, Origin e Sec-Fetch de fora recusados) e, no Linux, o botão também
(pode_instalar: o instalador oficial com a casa na pasta de ferramentas do MaiSim); com o claude (de mentira) já instalado,
o POST recusa sem rodar nada. O fluxo inteiro (começa, acompanha, termina, acha o
claude novo) roda com um instalador de mentira em claude_instala_offline.py."""
import json, subprocess, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_IA_TESTE") == "1" and not ENV.get("MAISIM_INSTALA_CLAUDE_CMD"), "suba o servidor de teste (reinicia_servidor_teste.sh)"
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def pede(rota, corpo=None, **cab):
    h = {"Content-Type": "application/json", "X-MaiSim": "1", **{k.replace("_", "-"): v for k, v in cab.items()}}
    h = {k: v for k, v in h.items() if v is not None}
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=60); return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

for nome, cab in (("sem X-MaiSim", dict(X_MaiSim=None)), ("Origin de fora", dict(Origin="https://evil.example", Sec_Fetch_Site="cross-site")),
                  ("outra porta de localhost", dict(Origin="http://localhost:3000")), ("Host de fora (DNS rebinding)", dict(Host="evil.example:7201"))):
    c, j = pede("claude/instalar", {}, **cab)
    ok(c == 403, f"POST claude/instalar, {nome}: {c} ({j.get('erro')})")
for nome, cab in (("Origin de fora", dict(Origin="https://evil.example", Sec_Fetch_Site="cross-site")), ("Host de fora", dict(Host="evil.example:7201"))):
    c, j = pede("claude/instalacao", **cab)
    ok(c == 403, f"GET claude/instalacao, {nome}: {c}")
c, e = pede("claude/estado")
ok(c == 200 and e.get("sistema") == "linux" and e.get("pode_instalar") is True and "instalacao" not in e, f"estado: sistema {e.get('sistema')}, pode_instalar {e.get('pode_instalar')}")
c, j = pede("claude/instalacao")
ok(c == 200 and j.get("pode") is True and not j.get("andamento") and j.get("saida") == "", f"instalacao (GET local): {j}")
c, j = pede("claude/instalar", {})
ok(c == 409 and "já está instalado" in (j.get("erro") or ""), f"POST local com o claude já instalado: recusado, nada roda ({c}: {j.get('erro')})")
c2, j2 = pede("claude/instalacao")
ok(not j2.get("andamento"), "nada começou")
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
