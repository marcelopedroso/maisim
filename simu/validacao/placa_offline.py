"""A placa do HIL sem o Gecko nem o servidor (simu/hil): o placa.py aqui mesmo (127.0.0.1) e a ligacao.py do lado do PC.
Confere: o "info" (o modelo, o gcc, a versão), a chave errada recusada, o controle.c compilado e rodando "na placa" com o
pil_texec_us (o tempo do maisim_passo medido nela) e as mesmas contas do worker local, e que um controle preso num laço
infinito é encerrado quando o PC fecha a conexão (o MaiSim fechado ou a rede caída no meio da rodada)."""
import json, os, socket, subprocess, sys, tempfile, time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "simu" / "hil"))
import ligacao  # noqa: E402

falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def porta_livre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); return s.getsockname()[1]


def espera(porta, prazo=10):
    fim = time.time() + prazo
    while time.time() < fim:
        try:
            socket.create_connection(("127.0.0.1", porta), timeout=0.5).close(); return True
        except OSError:
            time.sleep(0.1)
    return False


CONTROLE = r"""#include "maisim_controle.h"
typedef struct { maisim_real soma; } Estado;
size_t maisim_tamanho_estado(void) { return sizeof(Estado); }
void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *e) { (void)p; ((Estado *)e)->soma = 0.0; }
void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    e->soma += m[M_x] * p[P_k] + t;
    if (m[M_x] < 0) for (;;) e->soma += 1.0;      /* x < 0: preso para sempre (a vigia da placa tem de encerrar) */
    u[U_y] = e->soma;
    maisim_scope("soma", e->soma);
}
"""
CARREGA = {"op": "carrega", "nome": "controle", "arquivo": "controle.c", "atuacoes": None, "p": {"k": 0.5, "Ts": 1e-4},
           "nomes": ["controle"], "prefixar": False, "varios": False, "arquivos_c": {"controle.c": CONTROLE},
           "sinais": {"m": ["x"], "p": ["k", "Ts"], "u": ["y"]}, "precisao": "double"}


def pede(c, x, prazo=30):
    c.send_bytes(json.dumps(x).encode())
    if not c.poll(prazo):
        return {"ok": False, "erro": "sem resposta"}
    return json.loads(c.recv_bytes())


with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    chave = os.urandom(32)
    (d / "chave").write_text(chave.hex())
    porta = porta_livre()
    log = open(d / "placa.log", "w")
    placa = subprocess.Popen([sys.executable, "-u", str(RAIZ / "simu/hil/placa.py"), "--host", "127.0.0.1", "--porta", str(porta),
                              "--chave", str(d / "chave"), "--rodadas", str(d / "rodadas"), "--prio", "0", "--nucleos", "0"],
                             stdout=log, stderr=subprocess.STDOUT)
    ende = ("127.0.0.1", porta)
    try:
        ok(espera(porta), f"o placa.py escuta em 127.0.0.1:{porta}")
        inf = ligacao.info(ende, chave)
        versao = (RAIZ / "VERSION").read_text().strip()
        ok(inf.get("ok") and inf.get("gcc") and inf.get("versao") == versao and inf.get("nucleos") == [0],
           f"o info da placa: {inf.get('modelo')} · gcc {inf.get('gcc')} · versão {inf.get('versao')} · núcleos {inf.get('nucleos')}")
        try:
            ligacao.info(ende, os.urandom(32))
            ok(False, "a chave errada foi aceita")
        except Exception as e:
            ok(True, f"a chave errada é recusada ({type(e).__name__})")
        ok(placa.poll() is None and ligacao.info(ende, chave).get("ok"), "depois da chave errada, a placa segue atendendo")

        # o controle.c na placa × o mesmo no worker local (pipe): as mesmas contas, mais o pil_texec_us
        c = ligacao.conecta("c", ende, chave)
        r = pede(c, CARREGA)
        ok(r.get("ok"), f"o controle.c compila e carrega na placa {r.get('erro', '')}")
        rem = [pede(c, {"op": "passo", "t": k * 1e-4, "m": {"x": float(k)}, "msgs": []}) for k in range(5)]
        ok(all(x.get("ok") for x in rem), "cinco passos na placa")
        ok(all(isinstance(x["s"].get("pil_texec_us"), float) and 0 < x["s"]["pil_texec_us"] < 1e5 for x in rem),
           f"o pil_texec_us (o maisim_passo medido na placa) em todo passo: {[round(x['s']['pil_texec_us'], 2) for x in rem]} µs")
        r = pede(c, {"op": "parametros", "p": {"k": 2.0}})
        rem.append(pede(c, {"op": "passo", "t": 5e-4, "m": {"x": 5.0}, "msgs": []}))
        c.close()
        loc_log = open(d / "local.log", "w")
        w = subprocess.Popen([sys.executable, "-I", str(RAIZ / "simu/controle_worker_c.py")], cwd=d, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=loc_log, text=True, bufsize=1)
        def pede_local(x):
            w.stdin.write(json.dumps(x) + "\n"); w.stdin.flush(); return json.loads(w.stdout.readline())
        pede_local(CARREGA)
        loc = [pede_local({"op": "passo", "t": k * 1e-4, "m": {"x": float(k)}, "msgs": []}) for k in range(5)]
        pede_local({"op": "parametros", "p": {"k": 2.0}})
        loc.append(pede_local({"op": "passo", "t": 5e-4, "m": {"x": 5.0}, "msgs": []}))
        w.kill(); w.wait()
        iguais = all(a["a"] == b["a"] and a["s"]["soma"] == b["s"]["soma"] for a, b in zip(rem, loc))
        ok(iguais and len(rem) == len(loc) == 6 and "pil_texec_us" not in loc[0]["s"],
           f"placa × worker local: as mesmas atuações e o mesmo scope bit a bit (o parametros também): {[x['a']['y'] for x in rem]}")

        # o PC some no meio de um passo que não termina: a placa encerra o worker
        c = ligacao.conecta("c", ende, chave)
        pede(c, CARREGA)
        c.send_bytes(json.dumps({"op": "passo", "t": 0.0, "m": {"x": -1.0}, "msgs": []}).encode())
        time.sleep(1.0)
        c.close()
        fim, txt = time.time() + 15, ""
        while time.time() < fim and "encerrado" not in txt:
            time.sleep(0.3); txt = (d / "placa.log").read_text()
        ok("encerrado" in txt, "o controle preso num laço infinito é encerrado quando o PC fecha a conexão")
        ok(placa.poll() is None and ligacao.info(ende, chave).get("ok"), "e a placa segue no ar para a próxima rodada")
    except Exception as exc:
        ok(False, f"o teste caiu: {type(exc).__name__}: {exc}")
    finally:
        placa.kill(); placa.wait(); log.close()
        if falhas:
            print((d / "placa.log").read_text()[-2000:])
sys.exit(1 if falhas else 0)
