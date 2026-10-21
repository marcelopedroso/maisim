"""Os casos da revisão do passo 2b, offline (ipes.monta + destinos_controle, sem servidor)."""
import sys, copy, importlib.util
import os, pathlib
P = str(pathlib.Path(__file__).resolve().parents[1]); G = str(pathlib.Path(__file__).resolve().parents[2] / "exemplos") + "/"
MMC = G + "exemplo_cascata_hb.ipes"   # o circuito com subcircuitos dos exemplos: três células meia-ponte (SM-HB) em cascata
sys.path.insert(0, P)
spec = importlib.util.spec_from_file_location("srv", P + "/servidor.py"); srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)
import ipes
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def atu(r, nome):
    a = next(x for x in srv.atuadores_disponiveis(r) if x["nome"] == nome)
    return a["atraso_gecko"], [(q["tipo"], q["nome"], q["folha"], q["atraso"]) for q in a["destinos"]]
def el(**k):
    base = dict(dom="CONTROL", typ=0, x=0, y=0, dir=503, folha="0", uid="", entradas=[], saidas=[], mede=["", ""], txt=[0, 0], par={}, id_gecko=None, nome_tipo="", ativo=True)
    base.update(k); return base
# sem mudança: os modelos de sempre
r3 = ipes.monta(MMC)
ok(atu(r3, "EXT_S1") == (1, [("chave", "IGBT.1", "SUBCIRCUIT.1", 1), ("chave", "IGBT.2", "SUBCIRCUIT.1", 1)]), f"cascata EXT_S1: {atu(r3, 'EXT_S1')}")
ok(atu(r3, "CONST_CARGA") == (0, [("chave", "S.1", "principal", 0)]), f"cascata CONST_CARGA: {atu(r3, 'CONST_CARGA')}")
rpi = ipes.monta(G + "exemplo_controle_pi.ipes"); ok(atu(rpi, "u_ctrl") == (1, [("fonte", "U.1", "principal", 1)]), f"PI u_ctrl: {atu(rpi, 'u_ctrl')}")
rpw = ipes.monta(G + "exemplo_controle_pwm.ipes"); ok(atu(rpw, "g") == (0, [("chave", "S.1", "principal", 0)]), f"PWM g: {atu(rpw, 'g')}")
# 1. GATE sem chave na rede do u_ctrl: não é destino
r = copy.deepcopy(rpi); u = next(e for e in r["folhas"]["0"]["elementos"] if e["nome"] == "U.1")
r["folhas"]["0"]["elementos"].append(el(tipo="GATE", nome="GATE.9", entradas=["u_ctrl"], terminais=[dict(x=90, y=90, rotulo="u_ctrl", lado="e")]))
ok(atu(r, "u_ctrl") == (1, [("fonte", "U.1", "principal", 1)]), f"GATE sem chave ignorado: {atu(r, 'u_ctrl')}")
# 2. elemento desativado: o GATE.1 do buck desligado → g sem destino
r = copy.deepcopy(rpw); next(e for e in r["folhas"]["0"]["elementos"] if e["nome"] == "GATE.1")["ativo"] = False
ok(atu(r, "g") == (1, []), f"GATE desativado ignorado: {atu(r, 'g')}")
# 3. TERM ligado só pelo rótulo dentro do SM (sem o fio que encosta nele)
r = copy.deepcopy(r3); sub = next(e for e in r["folhas"]["0"]["elementos"] if e["nome"] == "SUBCIRCUIT.1"); fl = r["folhas"][sub["uid"]]
term = next(e for e in fl["elementos"] if e["tipo"] == "TERM" and e["nome"] == "S"); pt = (term["terminais"][0]["x"], term["terminais"][0]["y"])
antes = len(fl["fios"]); fl["fios"] = [w for w in fl["fios"] if not (w["dom"] == "CONTROL" and pt in (tuple(w["pts"][0]), tuple(w["pts"][-1])))]
ok(antes > len(fl["fios"]) and atu(r, "EXT_S1")[0] == 1 and len(atu(r, "EXT_S1")[1]) == 2, f"TERM só por rótulo ({antes - len(fl['fios'])} fio tirado): {atu(r, 'EXT_S1')}")
# 4. terminal global: CONST.1 → GLOBAL 'GG' → outra folha: GLOBAL 'GG' → GATE.2 → S.9 (sem o GATE.1)
r = copy.deepcopy(rpw); f0 = r["folhas"]["0"]; f0["elementos"] = [e for e in f0["elementos"] if e["nome"] != "GATE.1"]
c1 = next(e for e in f0["elementos"] if e["nome"] == "CONST.1"); tc = c1["terminais"][0]
f0["elementos"].append(el(tipo="GLOBAL_CONTROL", nome="GG", terminais=[dict(x=tc["x"], y=tc["y"], rotulo="", lado="e")]))
r["folhas"]["X"] = dict(nome="SUBCIRCUIT.9", fios=[], limites=[0, 0, 10, 10], elementos=[
    el(tipo="GLOBAL_CONTROL", nome="GG", folha="X", terminais=[dict(x=5, y=5, rotulo="", lado="e")]),
    el(tipo="GATE", nome="GATE.2", folha="X", mede=["S.9", ""], terminais=[dict(x=5, y=5, rotulo="", lado="e")]),
    el(dom="LK", tipo="S", nome="S.9", folha="X", terminais=[dict(x=20, y=4, rotulo=""), dict(x=20, y=8, rotulo="")])])
ok(atu(r, "g") == (0, [("chave", "S.9", "SUBCIRCUIT.9", 0)]), f"terminal global atravessado: {atu(r, 'g')}")
# 5. fonte controlada dentro do SM com o rótulo da rede que vem de fora: o Gecko não a aciona → não é destino
r = copy.deepcopy(r3); sub = next(e for e in r["folhas"]["0"]["elementos"] if e["nome"] == "SUBCIRCUIT.1"); fl = r["folhas"][sub["uid"]]
fl["elementos"].append(el(dom="LK", tipo="U", nome="U.9", folha=sub["uid"], par={"sourceType": 400.0}, mede=["S", ""], terminais=[dict(x=80, y=4, rotulo=""), dict(x=80, y=8, rotulo="")]))
ok(all(q[1] != "U.9" for q in atu(r, "EXT_S1")[1]), f"fonte do outro lado do terminal não conta: {atu(r, 'EXT_S1')}")
# 5b. a mesma fonte na folha principal com o rótulo da saída do CONST (alimentada por bloco da mesma folha) conta
r = copy.deepcopy(r3); r["folhas"]["0"]["elementos"].append(el(dom="LK", tipo="U", nome="U.9", par={"sourceType": 400.0}, mede=["EXT_S1", ""], terminais=[dict(x=900, y=4, rotulo=""), dict(x=900, y=8, rotulo="")]))
ok(("fonte", "U.9", "principal", 1) in atu(r, "EXT_S1")[1] and atu(r, "EXT_S1")[0] == 1, f"fonte na mesma folha conta: {atu(r, 'EXT_S1')}")
# avisos: destinos com atrasos diferentes / mínimo do Gecko
a = dict(nome="x", atraso_gecko=0, destinos=[dict(tipo="chave", nome="S.1", folha="principal", atraso=0), dict(tipo="chave", nome="S.2", folha="principal", atraso=1)])
f = srv.destinos_fora_do_passo(a, 1, 1); ok(len(f) == 1 and f[0][1] == 2 and "atrasos diferentes" in f[0][2], f"aviso de atrasos diferentes: {f}")
a = dict(nome="x", atraso_gecko=2, destinos=[dict(tipo="fonte", nome="U.1", folha="principal", atraso=2)])
f = srv.destinos_fora_do_passo(a, 1, 0); ok(len(f) == 1 and f[0][1] == 2 and "no mínimo 2" in f[0][2], f"aviso do mínimo do Gecko: {f}")
print("falhas:", falhas)
