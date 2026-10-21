"""Os "olhos" do Claude do PEW e o modo autônomo (instância de teste 8768, claude de mentira, cenário "autonomo"), pedido de
Marcelo em 19/10: o Claude do PEW implementou a Etapa 1 da estratégia e parou pedindo os números "que só você consegue
ler"; "ter os dois já pode ser vantagem".
Olhos: toda rodada grava resumo.md e serie/<canal>.csv ao lado do .npz; no pedido seguinte, a pasta do Claude tem
ULTIMA_RODADA.md e ULTIMA_RODADA/, e o pedido diz qual rodada é.
Modo autônomo (até 3 rodadas): o Claude faz a versão 1; o PEW a simula (Claude_1) sem aplicar; ele lê o resumo, faz a
versão 2; o PEW a simula (Claude_2); ele diz [PRONTO]. As rodadas usam a versão dele, o controle do usuário não muda, a
conversa é retomada (--resume) e a proposta final é a última versão. Parar no meio de uma rodada do Claude para a rodada."""
import json, shutil, subprocess, time, urllib.request
from pathlib import Path
B = "http://localhost:8768/pew/simu/"
PID = subprocess.run("ss -ltnp | grep ':8768 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("PEW_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF = Path(ENV["PEW_CLAUDE_DIR"])
assert "pew_simu_teste" in str(CONF) or "/tmp/" in str(CONF)
CASA = Path(ENV["PEW_SIMU_CACHE"]) / "claude"
RODADAS = Path(ENV["PEW_SIMU_RODADAS"])
SALVOS = Path(ENV["PEW_SIMU_SALVOS"])
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-PEW": "1"})
    try: return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def chamadas():
    f = CONF / "falso_chamadas.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines() if "stream-json" in x] if f.exists() else []
def espera(seg=240):
    for _ in range(int(seg / 0.5)):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.5)
    return e
def espera_rodada(seg=120):
    for _ in range(int(seg / 0.3)):
        r = api("editor/rodada")
        if r.get("estado") not in ("preparando", "rodando", "pausada"):
            return r
        time.sleep(0.3)
    return r
def kp(c):
    return next((q["valor"] for q in c["parametros"] if q["nome"] == "Kp"), None)
REPO = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    shutil.copy(REPO / f, SALVOS / f)
ex = SALVOS / "exemplo_controle_pwm.ipes"
(CONF / "falso_logado").write_text("")
(CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
try:
    r = api("editor/abrir", {"arq": str(ex), "modo": "descartar"})
    ok("ERRO" not in r, f"exemplo do buck aberto ({r.get('erro', 'ok')})")
    kp0 = kp(api("editor/controle")["controle"])
    api("claude/nova", {})
    # ---- olhos: uma rodada do usuário grava o resumo
    r = api("editor/rodar", {"dt": 1e-6, "tfim": 0.002, "nome": "olhos_teste", "amostras": 400})
    fim = espera_rodada()
    pr = sorted(RODADAS.glob("*_olhos_teste"))[-1] if list(RODADAS.glob("*_olhos_teste")) else None
    res = (pr / "resumo.md").read_text() if pr and (pr / "resumo.md").exists() else ""
    series = sorted(x.name for x in (pr / "serie").glob("*.csv")) if pr else []
    ok(fim.get("estado") == "fim" and "# Resumo da rodada olhos_teste" in res and "## Regime (última janela, J5)" in res and "estado final: fim" in res
       and len(series) >= 2, f"a rodada do usuário grava resumo.md ({len(res)} caracteres) e {len(series)} séries ({', '.join(series[:4])}…)")
    (CONF / "falso_cenario").write_text("ganho")
    api("claude/pedir", {"texto": "dobre o Kp", "dt": 1e-6, "tfim": 0.002})
    e = espera()
    pc = CASA / "conversas" / str(e.get("pasta"))
    prompt1 = chamadas()[-1]["args"][chamadas()[-1]["args"].index("-p") + 1]
    ok((pc / "ULTIMA_RODADA.md").exists() and "olhos_teste" in (pc / "ULTIMA_RODADA.md").read_text() and (pc / "ULTIMA_RODADA").is_dir()
       and f"ULTIMA_RODADA.md: o resumo da rodada mais nova ({pr.name})" in prompt1,
       f"no pedido seguinte, a pasta do Claude tem ULTIMA_RODADA.md e ULTIMA_RODADA/, e o pedido diz qual rodada é ({pr.name})")
    ok(not e.get("auto") and len(chamadas()) == 1, "sem o modo autônomo: uma chamada só, sem rodada do Claude")
    api("claude/descartar", {})
    # ---- modo autônomo
    api("claude/nova", {})
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    antes_rod = set(RODADAS.glob("*_Claude_*"))
    (CONF / "falso_cenario").write_text("autonomo")
    t0 = time.time()
    r = api("claude/pedir", {"texto": "implemente e confira sozinho", "dt": 1e-6, "tfim": 0.002, "autonomo": 3})
    e = espera()
    dur = time.time() - t0
    novas = sorted(set(RODADAS.glob("*_Claude_*")) - antes_rod)
    h = e["conversa"]["historico"]
    ok(e.get("auto", {}).get("feitas") == 2 and e["auto"].get("max") == 3 and e["auto"].get("fim") == "o Claude disse [PRONTO]" and not e.get("erro"),
       f"o ciclo: {e.get('auto')} em {dur:.0f} s")
    ok([x["pedido"] for x in h] == ["implemente e confira sozinho", "(modo autônomo: resultado da rodada 1 de 3)", "(modo autônomo: resultado da rodada 2 de 3)"],
       f"a conversa: {[x['pedido'] for x in h]}")
    ok("li a rodada 1: | " in (h[1].get("resposta") or ""), f"na volta 1 ele leu o resumo da rodada: {(h[1].get('resposta') or '')[:110]}…")
    cs = chamadas()
    ok(len(cs) == 3 and "--session-id" in cs[0]["args"] and all("--resume" in c["args"] for c in cs[1:])
       and "A rodada 1 de 3" in cs[1]["args"][cs[1]["args"].index("-p") + 1], "3 chamadas: a 1ª nova, as outras retomando a conversa (--resume)")
    kps = [json.loads((p / "controle.json").read_text()) for p in novas]
    kps = [next((q["valor"] for q in c["parametros"] if q["nome"] == "Kp"), None) for c in kps]
    ok([p.name.split("_", 2)[-1] for p in novas] == ["Claude_1", "Claude_2"] and kps == [kp0 * 2, kp0 * 4] and all((p / "resumo.md").exists() for p in novas),
       f"as rodadas simularam as versões dele: {[p.name for p in novas]}, Kp {kps} (o do usuário: {kp0})")
    ok(kp(api("editor/controle")["controle"]) == kp0, f"o controle do usuário não mudou (Kp {kp0})")
    par = {q["nome"]: q["valor"] for q in (e.get("proposta") or {}).get("parametros", [])}
    ok((e.get("proposta") or {}).get("mudou") and par.get("Kp") == kp0 * 4, f"a proposta final é a última versão (Kp {par.get('Kp')})")
    api("claude/descartar", {})
    # ---- o limite de passos no meio da versão: o modo autônomo continua de onde parou (até 3 vezes seguidas)
    api("claude/nova", {})
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    antes_rod = set(RODADAS.glob("*_Claude_*"))
    (CONF / "falso_cenario").write_text("limite")
    api("claude/pedir", {"texto": "faça a etapa grande", "dt": 1e-6, "tfim": 0.002, "autonomo": 3})
    e = espera()
    h = e["conversa"]["historico"]
    novas = sorted(set(RODADAS.glob("*_Claude_*")) - antes_rod)
    ok([x["pedido"] for x in h] == ["faça a etapa grande", "(modo autônomo: continua depois do limite de passos)", "(modo autônomo: resultado da rodada 1 de 3)"]
       and "limite" in (h[0].get("erro") or "") and e.get("auto", {}).get("feitas") == 1 and e["auto"].get("fim") == "o Claude disse [PRONTO]"
       and len(novas) == 1 and "chegou ao limite de 100 passos" in chamadas()[1]["args"][chamadas()[1]["args"].index("-p") + 1],
       f"estourou o limite: continua de onde parou, termina, a rodada Claude_1, [PRONTO] ({[x['pedido'] for x in h]})")
    ok("--max-turns" in chamadas()[0]["args"] and chamadas()[0]["args"][chamadas()[0]["args"].index("--max-turns") + 1] == "100", "o limite por chamada é de 100 passos")
    api("claude/descartar", {})
    # ---- parar no meio de uma rodada do Claude
    api("claude/nova", {})
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    (CONF / "falso_cenario").write_text("autonomo")
    api("claude/pedir", {"texto": "de novo", "dt": 1e-6, "tfim": 0.05, "autonomo": 5})
    pegou = False
    for _ in range(200):
        rr = api("editor/rodada")
        if rr.get("estado") == "rodando" and str(rr.get("nome", "")).startswith("Claude_"):
            pegou = True
            break
        time.sleep(0.1)
    api("claude/parar", {})
    fim = espera_rodada()
    time.sleep(2)
    e = api("claude/pedido")
    ok(pegou and fim.get("estado") == "parada" and not e.get("andamento") and len(chamadas()) == 1,
       f"parar no meio da rodada {rr.get('nome')}: a rodada {fim.get('estado')}, o pedido parado, nenhuma chamada a mais ({len(chamadas())})")
finally:
    for f in ("falso_logado", "falso_cenario"):
        (CONF / f).unlink(missing_ok=True)
    api("claude/descartar", {})
    api("claude/nova", {})
    api("editor/abrir", {"arq": str(ex), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
