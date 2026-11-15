"""A placa do HIL na rodada de verdade (simu/hil): o controle.c do exemplo do buck com PWM e PI no controle
(exemplos/exemplo_controle_pwm) rodando "na placa" — o placa.py aqui mesmo, em 127.0.0.1:7207, com a chave do perfil de
teste (config/teste.env: MAISIM_HIL e MAISIM_HIL_CHAVE) — tem de dar as mesmas formas de onda, bit a bit, que o mesmo C no
PC (o SIL), e trazer a coluna pil_texec_us (o tempo do maisim_passo na placa). Confere também: o estado da placa no painel
(fora do ar, no ar, a chave errada), a caixinha "na placa" guardada no controle, o "testar" do painel rodando no PC mesmo com
a placa fora do ar, e a rodada que acaba em erro claro quando a placa não responde."""
import json, re, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"
HOST, PORTA = config("MAISIM_HIL", "127.0.0.1:7207").rsplit(":", 1)
CHAVE = config("MAISIM_HIL_CHAVE", "")


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


# o mesmo controle em C da validacao/controle_c_api.py (o do exemplo, linha a linha)
CONTROLE_C = re.search(r'CONTROLE_C = r"""(.*?)"""', (RAIZ / "simu/validacao/controle_c_api.py").read_text(encoding="utf-8"), re.S).group(1)
ex = json.loads((RAIZ / "exemplos/exemplo_controle_pwm.controle.json").read_text())


def roda(nome, **extra):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": nome, "amostras": "5000", **extra})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); j = api("editor/rodada")
    return j


def guarda(**c):
    return api("editor/controle", {"controle": {**ex, **c}})


class Placa:
    """O placa.py daqui, com a chave do perfil de teste (ou outra, para a chave errada)."""
    def __init__(self, chave=CHAVE):
        self.d = tempfile.TemporaryDirectory()
        (Path(self.d.name) / "chave").write_text(chave)
        self.log = open(Path(self.d.name) / "placa.log", "w")
        self.p = subprocess.Popen([sys.executable, "-u", str(RAIZ / "simu/hil/placa.py"), "--host", HOST, "--porta", PORTA,
                                   "--chave", str(Path(self.d.name) / "chave"), "--rodadas", str(Path(self.d.name) / "rodadas"),
                                   "--prio", "0", "--nucleos", "0"], stdout=self.log, stderr=subprocess.STDOUT)
        fim = time.time() + 10
        while time.time() < fim and not (api("editor/controle/placa").get("ok") or "AuthenticationError" in api("editor/controle/placa").get("erro", "")):
            time.sleep(0.2)

    def fecha(self):
        self.p.kill(); self.p.wait(); self.log.close(); self.d.cleanup()


placa = None
try:
    st = api("editor/controle/placa")
    ok(st.get("configurada") is True and st.get("ok") is False and f"{HOST}:{PORTA}" in st.get("erro", ""),
       f"a placa configurada e fora do ar: o painel diz qual e por quê ({st.get('erro', '')[:90]})")
    r = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    ok("ERRO" not in r, f"abre o exemplo do buck com PWM no controle {r.get('erro', '')}")
    r = guarda(c={"usar": True, "arquivos": {"controle.c": CONTROLE_C}, "placa": True})
    ok("ERRO" not in r and r["controle"]["c"].get("placa") is True, "a caixinha \"na placa\" fica guardada no controle (c.placa)")
    t3 = api("editor/controle/testar", {"dt": 1e-6})
    ok("ERRO" not in t3 and len(t3.get("passos", [])) == 3, f"o testar do painel roda no PC, com a placa fora do ar {t3.get('erro', '')}")
    je = roda("placa_fora")
    ok(je.get("estado") == "erro" or "ERRO" in je, f"a rodada na placa fora do ar acaba em erro: {je.get('erro', '')[:120]}")
    ok(f"{HOST}:{PORTA}" in je.get("erro", "") and je.get("erro", "").startswith("controle.c"),
       "e o erro diz o endereço da placa (o que conferir) e o arquivo do controlador (controle.c, não controle.py)")

    placa = Placa()
    st = api("editor/controle/placa")
    ok(st.get("ok") is True and st.get("gcc") and st.get("versao") == (RAIZ / "VERSION").read_text().strip(),
       f"a placa no ar: o painel mostra o modelo e o gcc dela ({st.get('modelo')} · gcc {st.get('gcc')})")
    jc = roda("placa_c_pc", linguagem="c")
    ok(jc.get("estado") == "fim", f"o C no PC (linguagem=c, com a caixinha marcada): {jc.get('estado')} {jc.get('erro', '')}")
    jb = roda("placa_c_placa")
    ok(jb.get("estado") == "fim", f"o C na placa (o guardado): {jb.get('estado')} {jb.get('erro', '')}")
    if jc.get("arquivo") and jb.get("arquivo"):
        a, b = np.load(jc["arquivo"]), np.load(jb["arquivo"])
        cols = sorted(k for k in set(a.files) & set(b.files) if np.issubdtype(a[k].dtype, np.number))
        ok(set(b.files) - set(a.files) == {"pil_texec_us"}, f"a rodada na placa tem as mesmas colunas e mais a pil_texec_us: {sorted(set(b.files) ^ set(a.files))}")
        difs = [k for k in cols if not np.array_equal(a[k], b[k], equal_nan=True)]
        ok(not difs and len(cols) >= 9, f"C no PC × C na placa iguais bit a bit em todas as {len(cols)} colunas"
                                        + (f"; diferentes: { {k: float(np.nanmax(np.abs(a[k] - b[k]))) for k in difs} }" if difs else ""))
        if "pil_texec_us" in b.files:
            x = b["pil_texec_us"][np.isfinite(b["pil_texec_us"])]
            ok(len(x) > 100 and np.all(x > 0) and np.median(x) < 1e4, f"pil_texec_us: mediana {np.median(x):.2f} µs, máx {x.max():.1f} µs")
    jp = roda("placa_pedida", linguagem="placa")
    ok(jp.get("estado") == "fim" and api("editor/controle")["controle"]["c"]["placa"] is True,
       "a rodada com linguagem=placa roda na placa sem mudar o que está guardado")
    placa.fecha()
    placa = Placa(chave="ab" * 32)                       # outra chave: a placa recusa
    st = api("editor/controle/placa")
    ok(st.get("ok") is False and "AuthenticationError" in st.get("erro", ""), f"a chave errada: o painel diz ({st.get('erro', '')[:90]})")
    jw = roda("placa_chave_errada")
    ok(jw.get("estado") == "erro" or "ERRO" in jw, f"e a rodada não roda: {jw.get('erro', '')[:100]}")
    guarda(c={"usar": True, "arquivos": {"controle.c": CONTROLE_C}})          # a tela de antes: sem o campo da placa
    ok(api("editor/controle")["controle"]["c"].get("placa") is False, "guardar sem o campo da placa a desliga (o controle de antes roda no PC)")
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    if placa:
        placa.fecha()
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
