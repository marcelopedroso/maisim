"""O .msd (msd.py), sem servidor: montar, ler e instalar numa pasta temporária (os arquivos batem; o meta.modelo do .npz e o
"- modelo:" do resumo.md apontam para o caminho novo; nenhum caminho da origem no pacote); as recusas (zip com "..",
caminho absoluto, "\\", extensão estranha, SHA trocado, lista diferente do manifest, acima do limite, versão de formato mais
nova), e nada gravado quando recusa; o conflito de nome gera _2 (e a pasta da rodada também); o aviso do arquivo externo."""
import gzip, hashlib, io, json, os, shutil, sys, tempfile, time, zipfile
from pathlib import Path
import numpy as np
AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(RAIZ / "simu"))
import msd  # noqa: E402

falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def recusa(dados, txt):
    try:
        msd.le(dados)
    except ValueError as e:
        return ok(True, f"{txt}: recusado ({e})")
    ok(False, f"{txt}: deveria recusar")


def zip_de(arqs, man=None, muda=None):
    """Um .msd feito à mão: arqs {caminho: bytes}; o manifest certo (ou man), e muda(man) para estragá-lo."""
    m = man or {"formato": msd.FORMATO, "versao": 1, "circuito": "circ", "rodadas": [],
                "arquivos": [{"caminho": k, "tamanho": len(b), "sha256": hashlib.sha256(b).hexdigest()} for k, b in arqs.items()]}
    if muda:
        muda(m)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps(m))
        for k, b in arqs.items():
            z.writestr(k, b)
    return buf.getvalue()


tmp = Path(tempfile.mkdtemp(prefix="msd_offline_"))
try:
    ORIGEM = "/home/fulano/MaiSim/circuitos/circ.ipes"
    ipes = (RAIZ / "exemplos/exemplo_controle_pwm.ipes").read_bytes()
    irmaos = {".controle.json": (RAIZ / "exemplos/exemplo_controle_pwm.controle.json").read_bytes(),
              ".aparencia.json": b'{"cores": {"v_o": "#ff0000"}}', ".scope.json": b'{"itens": [{"secao": "a"}]}'}
    rod = tmp / "origem_rodadas" / "2026-10-24_101010_ensaio"
    (rod / "serie").mkdir(parents=True)
    t = np.linspace(0, 1, 50)
    np.savez_compressed(rod / "scope_ensaio.npz", meta=np.array(json.dumps({"planta": "gecko-maisim", "rotulo": "ensaio", "modelo": ORIGEM, "chave_layout": ORIGEM})),
                        t=t, v_o=np.sin(t))
    (rod / "resumo.md").write_text(f"# Resumo da rodada ensaio\n\n- modelo: {ORIGEM}\n- estado final: fim\n", encoding="utf-8")
    (rod / "serie" / "v_o.csv").write_text("t,v_o\n0,0\n")
    (rod / "controle.py").write_text("def passo(t, m, p, e):\n    return {}\n")
    (rod / "controle.log").write_text("ok\n")
    (rod / ".guardada").write_text("2026-10-24 10:10\n")
    (rod / "lixo.exe").write_bytes(b"MZ")                       # o que o MaiSim não conhece não vai
    os.utime(rod / "scope_ensaio.npz", (1_700_000_000, 1_700_000_000))

    dados, avisos = msd.monta("circ", ipes, irmaos, [rod], autor="fulano")
    z = zipfile.ZipFile(io.BytesIO(dados))
    nomes = set(z.namelist())
    ok({"manifest.json", "circuito/circ.ipes", "circuito/circ.controle.json", "circuito/circ.aparencia.json", "circuito/circ.scope.json",
        "rodadas/2026-10-24_101010_ensaio/scope_ensaio.npz", "rodadas/2026-10-24_101010_ensaio/resumo.md",
        "rodadas/2026-10-24_101010_ensaio/serie/v_o.csv", "rodadas/2026-10-24_101010_ensaio/.guardada"} <= nomes
       and not any(n.endswith(".exe") for n in nomes) and not avisos, f"montar: o circuito, os irmãos e a rodada inteira (sem o .exe); sem aviso ({len(nomes)} arquivos)")
    tudo = b"".join(z.read(n) if not n.endswith(".npz") else str(np.load(io.BytesIO(z.read(n)))["meta"]).encode() for n in nomes)
    ok(b"/home/fulano" not in tudo and b"- modelo: circ.ipes\n" in z.read("rodadas/2026-10-24_101010_ensaio/resumo.md"),
       "nenhum caminho da máquina de origem no pacote (meta.modelo e o resumo viram circ.ipes)")
    man = msd.le(dados)
    ok(man["formato"] == "maisim-msd" and man["versao"] == 1 and man["circuito"] == "circ" and man["autor"] == "fulano"
       and [r["pasta"] for r in man["rodadas"]] == ["2026-10-24_101010_ensaio"] and man["rodadas"][0]["guardada"] and man["rodadas"][0]["nome"] == "ensaio"
       and man["irmaos"] == list(msd.IRMAOS) and all(a["caminho"].count("\\") == 0 for a in man["arquivos"]),
       f"ler: o manifest (formato, versão, circuito, autor, a rodada guardada, os irmãos, caminhos com /)")

    # instalar num MAISIM_DADOS temporário
    SALVOS, RODADAS = tmp / "dados" / "circuitos", tmp / "dados" / "rodadas"
    novo = lambda p: Path(p).as_posix()
    r = msd.instala(dados, SALVOS, RODADAS, modelo_de=novo)
    dest = SALVOS / "circ.ipes"
    ok(r["nome"] == "circ" and dest.read_bytes() == ipes and all((SALVOS / f"circ{s}").read_bytes() == b for s, b in irmaos.items()),
       "instalar: o .ipes e os irmãos iguais aos de origem, em circuitos/")
    d = RODADAS / "2026-10-24_101010_ensaio"
    meta = json.loads(str(np.load(d / "scope_ensaio.npz")["meta"]))
    v = np.load(d / "scope_ensaio.npz")["v_o"]
    ok(meta["modelo"] == dest.as_posix() and meta["chave_layout"] == dest.as_posix() and meta["rotulo"] == "ensaio" and np.allclose(v, np.sin(t)),
       f"a rodada: meta.modelo e chave_layout apontam para o caminho novo; os vetores iguais ({meta['modelo']})")
    ok(f"- modelo: {dest.as_posix()}\n" in (d / "resumo.md").read_text(encoding="utf-8") and (d / ".guardada").exists() and (d / "serie/v_o.csv").exists()
       and (d / "controle.py").exists() and r["rodadas"] == [d.name], "o resumo.md aponta para o caminho novo; .guardada, série e controle.py junto")
    ok(abs((d / "scope_ensaio.npz").stat().st_mtime - 1_700_000_000) < 3, "a data da rodada é a de origem (a lista ordena por ela)")
    ok(not [p for p in (*SALVOS.iterdir(), *RODADAS.iterdir()) if p.name.startswith(".msd_")], "sem sobra de pasta temporária")

    # o conflito: o mesmo nome já existe
    ok(msd.ocupado(SALVOS, "circ") and msd.livre(SALVOS, "circ") == "circ_2", "conflito: o nome livre sugerido é circ_2")
    try:
        msd.instala(dados, SALVOS, RODADAS); ok(False, "por cima sem substituir: deveria recusar")
    except ValueError as e:
        ok("circ" in str(e), f"por cima sem substituir: recusado ({e})")
    r2 = msd.instala(dados, SALVOS, RODADAS, "circ_2", modelo_de=novo)
    m2 = json.loads(str(np.load(RODADAS / r2["rodadas"][0] / "scope_ensaio.npz")["meta"]))
    ok((SALVOS / "circ_2.ipes").exists() and r2["rodadas"] == ["2026-10-24_101010_ensaio_2"] and m2["modelo"] == (SALVOS / "circ_2.ipes").as_posix()
       and (SALVOS / "circ.ipes").read_bytes() == ipes, f"importar como circ_2: a rodada vai para {r2['rodadas']} ligada ao circ_2; o circ fica")
    r3 = msd.instala(dados, SALVOS, RODADAS, "circ_3", rodadas=[], modelo_de=novo)
    ok(r3["rodadas"] == [] and (SALVOS / "circ_3.ipes").exists(), "sem rodadas escolhidas: só o circuito")
    (SALVOS / "circ.cores.json").write_text("{}")
    sem_irmaos, _ = msd.monta("circ", ipes, {}, [])
    msd.instala(sem_irmaos, SALVOS, RODADAS, "circ", substituir=True)
    ok(not any((SALVOS / f"circ{s}").exists() for s in (*msd.IRMAOS, ".cores.json")), "substituir: os irmãos antigos que o pacote não traz saem")

    # as recusas (e nada gravado)
    base = {"circuito/circ.ipes": ipes}
    recusa(b"isto nao e zip", "não é zip")
    recusa(zip_de({**base, "../fora.txt": b"x"}), 'caminho com ".."')
    recusa(zip_de({**base, "/etc/fora.txt": b"x"}), "caminho absoluto")
    recusa(zip_de({**base, "rodadas\\p\\a.csv": b"x"}), 'caminho com "\\"')
    recusa(zip_de({**base, "C:/fora.txt": b"x"}), "caminho com unidade (C:)")
    recusa(zip_de({**base, "rodadas/p/a.exe": b"x"}), "extensão desconhecida")
    recusa(zip_de({**base, "circuito/outro.ipes": b"x"}), "um arquivo de circuito com outro nome")
    recusa(zip_de({"circuito/circ.controle.json": b"{}"}), "sem o .ipes")
    recusa(zip_de(base, muda=lambda m: m.update(versao=2, maisim="9.9.9")), "versão de formato mais nova")
    recusa(zip_de(base, muda=lambda m: m.update(formato="outro")), "formato errado")
    recusa(zip_de(base, muda=lambda m: m["arquivos"].append({"caminho": "rodadas/p/a.csv", "tamanho": 1, "sha256": "0" * 64})), "o manifest lista o que não veio")
    recusa(zip_de({**base, "rodadas/p/a.csv": b"x"}, muda=lambda m: m["arquivos"].pop()), "veio o que o manifest não lista")
    trocado = zip_de(base, muda=lambda m: m["arquivos"][0].update(sha256=hashlib.sha256(b"outro").hexdigest()))
    recusa(trocado, "SHA-256 trocado")
    antes = sorted(p.name for p in SALVOS.iterdir())
    try:
        msd.instala(trocado, SALVOS, RODADAS, "circ_9")
    except ValueError:
        pass
    ok(sorted(p.name for p in SALVOS.iterdir()) == antes, "recusado: nada gravado em circuitos/")
    lim, msd.MAX_BYTES = msd.MAX_BYTES, 1000
    recusa(dados, "acima do limite descompactado")
    msd.MAX_BYTES = lim
    lim, msd.MAX_ARQS = msd.MAX_ARQS, 3
    recusa(dados, "acima do limite de arquivos")
    msd.MAX_ARQS = lim

    # o aviso do arquivo externo
    buck = (RAIZ / "exemplos/exemplo_buck.ipes").read_bytes()
    fora = gzip.compress(gzip.decompress(buck).replace(b"useExternal false", b"useExternal true", 1))
    pac_fora, av = msd.monta("circ", fora, {}, [])
    _, av0 = msd.monta("circ", buck, {}, [])
    ok(len(av) == 1 and msd.le(pac_fora)["avisos"] == av and not av0, f"um arquivo fora do .ipes: a exportação avisa ({av}); o buck de sempre, não")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
raise SystemExit(1 if falhas else 0)
