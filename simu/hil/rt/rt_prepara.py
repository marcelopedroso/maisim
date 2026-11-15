"""Monta o HIL em tempo real da placa (roda na placa): extrai o controle.c do exemplo (o mesmo da prova do SIL), gera o
maisim_sinais.h (M_i_L, P_*, U_g) e o rt_params.h (os parâmetros do painel e os eventos de i_ref) e compila o rt_hil.c com o
gcc do ARM. Uso: python3 rt_prepara.py [pasta de saída, padrão ./build]"""
import json
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(AQUI)))
sys.path.insert(0, os.path.join(RAIZ, "simu"))
import sinais_c  # noqa: E402

saida = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "build")
os.makedirs(saida, exist_ok=True)
ex = json.load(open(os.path.join(RAIZ, "exemplos/exemplo_controle_pwm.controle.json"), encoding="utf-8"))
controle = re.search(r'CONTROLE_C = r"""(.*?)"""', open(os.path.join(RAIZ, "simu/validacao/controle_c_api.py"), encoding="utf-8").read(), re.S).group(1)
p = {x["nome"]: float(x["valor"]) for x in ex["parametros"]} | {"Ts": float(ex["Ts"])}
sinais = {"m": ["i_L"], "p": list(p), "u": ["g"]}
open(os.path.join(saida, "controle.c"), "w", encoding="utf-8").write(controle)
open(os.path.join(saida, "maisim_sinais.h"), "w", encoding="utf-8").write(sinais_c.gera_sinais_h(sinais))
with open(os.path.join(saida, "rt_params.h"), "w", encoding="utf-8") as f:
    f.write("/* gerado por rt_prepara.py */\n#include \"maisim_sinais.h\"\n")
    f.write("static const double P_INICIAL[MAISIM_N_P] = {%s};\n" % ", ".join(repr(v) for v in p.values()))
    ev = [a for a in ex["acionamentos"] if a["alvo"].startswith("p:")]
    f.write("static const struct { double t; int idx; double v; } EVENTOS[] = {%s};\n"
            % ", ".join("{%r, P_%s, %r}" % (float(a["t"]), sinais_c.ident(a["alvo"][2:]), float(a["valor"])) for a in sorted(ev, key=lambda a: a["t"])))
cmd = ["gcc", "-O2", "-std=gnu11", "-ffp-contract=off", "-I", saida, "-I", os.path.join(RAIZ, "simu/controle_c"), "-o", os.path.join(saida, "rt_hil"),
       os.path.join(AQUI, "rt_hil.c"), os.path.join(saida, "controle.c"), "-lm", "-lpthread"]
print(" ".join(cmd))
sys.exit(subprocess.run(cmd).returncode)
