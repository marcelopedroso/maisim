"""A atualização automática (simu/atualizacao.py), sem servidor e sem rede: a ordem das versões (semver com o -rc), os canais
(estável sem as prerelease; teste com elas; rascunho nunca), só a release com o arquivo deste jeito de instalação e o
.sha256, o SHA-256 (baixar com o certo; o errado recusa e não deixa nada), a origem fora do GitHub recusada, o AppImage
trocado no lugar (executável, rename) — com releases de mentira em arquivos (file://); nada é instalado nem reiniciado."""
import hashlib, json, os, sys, tempfile, time
from pathlib import Path
R = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(R / "config"), str(R / "simu")]
for k in [k for k in os.environ if k.startswith("MAISIM_")] + ["APPIMAGE", "APPDIR"]:
    os.environ.pop(k, None)
import lingua  # noqa: E402
import textos  # noqa: E402,F401
import atualizacao as A  # noqa: E402
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)

# a ordem: 0.3.0-rc2 < 0.3.0-rc13 < 0.3.0 < 0.3.1 (o -rc em ordem natural; a sem -rc depois das -rc)
seq = ["0.2.9", "0.3.0-rc2", "0.3.0-rc13", "0.3.0", "v0.3.1", "0.10.0", "1.0.0-rc1", "1.0.0"]
ok(all(A.mais_nova(seq[i + 1], seq[i]) and not A.mais_nova(seq[i], seq[i + 1]) for i in range(len(seq) - 1)), f"a ordem: {' < '.join(seq)}")
ok(not A.mais_nova("0.3.0", "0.3.0") and A.chave("abc") is None and A.chave("0.3") is None and not A.mais_nova("x", "0.1.0"), "igual não é mais nova; o que não é versão: None")

rel = json.loads((R / "simu/validacao/dados/releases_teste.json").read_text())
e = A.escolhe(rel, "estavel", "0.3.0", "fonte"); t = A.escolhe(rel, "teste", "0.3.0", "fonte")
ok(e and e["versao"] == "9.9.0" and not e["pre"] and "Novidades" in e["notas"], f"estável: a 9.9.0 (nem a -rc, nem o rascunho 10.0.0): {e and e['versao']}")
ok(t and t["versao"] == "9.9.1-rc1" and t["pre"], f"teste: a 9.9.1-rc1 (a prerelease): {t and t['versao']}")
ok(A.escolhe(rel, "estavel", "9.9.0", "fonte") is None and A.escolhe(rel, "teste", "9.9.1-rc1", "windows") is None, "já na mais nova: nada")
w = A.escolhe(rel, "estavel", "0.3.0", "windows"); ai = A.escolhe(rel, "estavel", "0.3.0", "appimage")
ok(w["arquivo"]["nome"] == "MaiSim-Setup-9.9.0.exe" and w["arquivo"]["sha256"].endswith(".exe.sha256")
   and ai["arquivo"]["nome"] == "MaiSim-9.9.0-x86_64.AppImage", f"o arquivo de cada jeito: {w['arquivo']['nome']}, {ai['arquivo']['nome']}")
# o ARM (aarch64): o AppImage e a pasta (.tar.gz) da arquitetura da máquina; o x86_64 não pega o do ARM, nem o contrário
maq = A.platform.machine
try:
    A.platform.machine = lambda: "aarch64"
    arm = [{"tag_name": "v9.9.0", "prerelease": False, "body": "", "assets": [{"name": n, "browser_download_url": f"https://x/{n}", "size": 1}
           for n in ("MaiSim-9.9.0-x86_64.AppImage", "MaiSim-9.9.0-x86_64.AppImage.sha256", "MaiSim-9.9.0-aarch64.AppImage",
                     "MaiSim-9.9.0-aarch64.AppImage.sha256", "MaiSim-9.9.0-aarch64.tar.gz", "MaiSim-9.9.0-aarch64.tar.gz.sha256")]}]
    ai_arm, pasta = A.escolhe(arm, "estavel", "0.3.0", "appimage"), A.escolhe(arm, "estavel", "0.3.0", "pasta")
    ok(A.arquitetura() == "aarch64" and ai_arm["arquivo"]["nome"] == "MaiSim-9.9.0-aarch64.AppImage" and pasta["arquivo"]["nome"] == "MaiSim-9.9.0-aarch64.tar.gz",
       f"no ARM: o AppImage e a pasta do aarch64 ({ai_arm['arquivo']['nome']}, {pasta['arquivo']['nome']})")
    A.platform.machine = lambda: "arm64"
    ok(A.arquitetura() == "aarch64", "arm64 (o nome no macOS e em alguns Linux) também é o aarch64")
    A.platform.machine = lambda: "x86_64"
    ok(A.escolhe([dict(arm[0], assets=[x for x in arm[0]["assets"] if "x86_64" not in x["name"]])], "estavel", "0.3.0", "appimage") is None,
       "no x86_64, uma release só com o ARM: nada (não baixa o AppImage da outra arquitetura)")
finally:
    A.platform.machine = maq
sem = [dict(r, assets=[a for a in r["assets"] if not a["name"].endswith(".exe.sha256")]) if r["tag_name"] == "v9.9.0" else r for r in rel]
ok(A.escolhe(sem, "estavel", "0.3.0", "windows") is None and A.escolhe(sem, "estavel", "0.3.0", "appimage")["versao"] == "9.9.0",
   "sem o .sha256 do instalador: o Windows não vê a release (o AppImage sim)")
# o formato de verdade do GitHub (v0.3.0 e v0.3.0-rc13, como estão no repositório em 25/10)
gh = [{"tag_name": "v0.3.0", "prerelease": False, "draft": False, "assets": [{"name": n} for n in ("MaiSim-Setup-0.3.0.exe", "MaiSim-Setup-0.3.0.exe.sha256", "MaiSim-Setup.exe")]},
      {"tag_name": "v0.3.0-rc13", "prerelease": True, "draft": False, "assets": [{"name": n} for n in ("MaiSim-Setup-0.3.0-rc13.exe", "MaiSim-Setup-0.3.0-rc13.exe.sha256")]}]
ok(A.escolhe(gh, "estavel", "0.3.0-rc13", "windows")["versao"] == "0.3.0" and A.escolhe(gh, "teste", "0.2.0", "windows")["versao"] == "0.3.0"
   and A.escolhe(gh, "estavel", "0.3.0", "windows") is None, "as releases do GitHub: da rc13 vai à 0.3.0; na 0.3.0, nada")
ok(A.sha_do_texto("ABCDEF" * 10 + "abcd  MaiSim.exe\n") == ("abcdef" * 10 + "abcd") and A.sha_do_texto("nada") is None, "o .sha256 do sha256sum")

with tempfile.TemporaryDirectory() as d:
    d = Path(d); dados = b"MaiSim de mentira " * 1000
    (d / "a.AppImage").write_bytes(dados)
    (d / "a.AppImage.sha256").write_text(f"{hashlib.sha256(dados).hexdigest()}  a.AppImage\n")
    (d / "errado.sha256").write_text("0" * 64 + "  a.AppImage\n")
    url, sha, errado = (d / "a.AppImage").as_uri(), (d / "a.AppImage.sha256").as_uri(), (d / "errado.sha256").as_uri()
    try:
        A.baixa(url, d / "fora", sha); ok(False, "uma origem fora do GitHub deveria ser recusada")
    except ValueError as x:
        ok("GitHub" in str(x) and not (d / "fora").exists(), f"fora dos testes, só o GitHub: {x}")
    os.environ["MAISIM_RELEASES_URL"] = str(d / "releases.json")
    f = A.baixa(url, d / "baixado", sha, lambda a, b: None)
    ok(f.read_bytes() == dados, "baixou e o SHA-256 confere")
    try:
        A.baixa(url, d / "baixado2", errado); ok(False, "o SHA-256 errado deveria ser recusado")
    except ValueError as x:
        ok("SHA-256" in str(x) and not (d / "baixado2").exists(), f"o SHA-256 errado: recusado e apagado ({x})")
    # o AppImage inteiro (sem reiniciar): releases de mentira com o arquivo em file://
    alvo = d / "MaiSim.AppImage"; alvo.write_bytes(b"velho"); alvo.chmod(0o644)
    r = [{"tag_name": "v9.0.0", "prerelease": False, "assets": [{"name": "MaiSim-9.0.0-x86_64.AppImage", "browser_download_url": url, "size": len(dados)},
                                                                {"name": "MaiSim-9.0.0-x86_64.AppImage.sha256", "browser_download_url": sha}]}]
    (d / "releases.json").write_text(json.dumps(r))
    os.environ["APPIMAGE"] = str(alvo)
    at = A.Atualizacao(d / "dados", d / "cache", lambda: None)
    s = at.verifica()
    ok(s["tipo"] == "appimage" and s["nova"]["versao"] == "9.0.0" and "arquivo" not in s["nova"] and s["canal"] == "estavel",
       f"a situação: {s['tipo']}, nova {s['nova'] and s['nova']['versao']}, canal {s['canal']} (o endereço do arquivo fica no servidor)")
    at.aplicando = {"fase": "baixando"}; at._aplica("appimage", at.nova, reinicia=False)
    ok(alvo.read_bytes() == dados and os.access(alvo, os.X_OK) and not alvo.with_name(alvo.name + ".novo").exists() and at.aplicando["fase"] == "reiniciando",
       f"o AppImage trocado no lugar (executável, sem .novo): fase {at.aplicando['fase']}")
    alvo.write_bytes(b"velho"); r[0]["assets"][1]["browser_download_url"] = errado; (d / "releases.json").write_text(json.dumps(r)); at.verifica()
    at.aplicando = {"fase": "baixando"}; at._aplica("appimage", at.nova, reinicia=False)
    ok(alvo.read_bytes() == b"velho" and not alvo.with_name(alvo.name + ".novo").exists() and at.aplicando["fase"] == "erro" and "SHA-256" in at.aplicando["erro"],
       "o SHA-256 errado: o AppImage de agora fica, sem .novo, e a página vê o erro")
    # ocupado DURANTE o download (uma rodada começou): baixa, confere, mas não troca nem reinicia
    r[0]["assets"][1]["browser_download_url"] = sha; (d / "releases.json").write_text(json.dumps(r)); at.verifica()
    at.ocupado = lambda: "rodada em andamento"
    at.aplicando = {"fase": "baixando"}; at._aplica("appimage", at.nova, reinicia=False)
    ok(alvo.read_bytes() == b"velho" and not alvo.with_name(alvo.name + ".novo").exists() and at.aplicando["fase"] == "erro"
       and at.aplicando["erro"] == "rodada em andamento", "ocupado durante o download: não troca o AppImage (e apaga o .novo)")
    at.ocupado = lambda: None
    at.aplicando = None
    try:
        at.ocupado = lambda: "salve antes"; at.aplica(); ok(False, "com circuito sem salvar deveria recusar")
    except ValueError as x:
        ok(str(x) == "salve antes" and at.aplicando is None, "com um motivo (circuito sem salvar): não começa")
    os.environ.pop("APPIMAGE")
    try:
        at.aplica(); ok(False, "a versão de programador não baixa")
    except ValueError as x:
        ok("git pull" in str(x), f"a versão de programador: {x}")
    # o canal: guardado em MAISIM_DADOS/atualizacao.json; o desconhecido, recusado
    s = at.muda_canal("teste")
    ok(s["canal"] == "teste" and json.loads((d / "dados/atualizacao.json").read_text()) == {"canal": "teste"}
       and A.Atualizacao(d / "dados", d / "cache").canal() == "teste", "o canal teste fica guardado")
    try:
        at.muda_canal("beta"); ok(False, "canal desconhecido deveria ser recusado")
    except ValueError:
        ok(at.canal() == "teste", "canal desconhecido: recusado (fica o de antes)")
    # sem rede (o endereço não responde): quieto, sem release nova
    os.environ["MAISIM_RELEASES_URL"] = "http://127.0.0.1:9/releases"
    t0 = time.time(); s = A.Atualizacao(d / "dados", d / "cache").verifica()
    ok(s["sem_rede"] and s["nova"] is None and time.time() - t0 < A.PRAZO + 2, f"sem rede: quieto ({time.time() - t0:.1f} s)")
ok(A.tipo_instalacao() == "fonte" and A.versao_atual() == (R / "VERSION").read_text().strip(), f"aqui: a versão {A.versao_atual()}, código-fonte")
# a versão em pasta (o .tar.gz do ARM): a troca da pasta inteira, os pacotes recusados e os dados dentro da pasta
import io, tarfile
def pacote(caminho, arquivos):
    with tarfile.open(caminho, "w:gz") as t:
        for nome, conteudo in arquivos.items():
            dado = conteudo.encode(); i = tarfile.TarInfo(nome); i.size = len(dado); i.mode = 0o755
            t.addfile(i, io.BytesIO(dado))
    return caminho
with tempfile.TemporaryDirectory() as d:
    d = Path(d); app = d / "maisim-app"; (app / "maisim").mkdir(parents=True)
    (app / "AppRun").write_text("velho"); (app / "maisim" / "VERSION").write_text("0.3.8-rc1"); (d / "MaiSim").mkdir(); (d / "MaiSim" / "c.ipes").write_text("meu")
    bom = pacote(d / "bom.tar.gz", {"maisim-app/AppRun": "#!/bin/bash\n", "maisim-app/maisim/VERSION": "0.3.8-rc2"})
    A.troca_pasta(bom, app)
    ok((app / "maisim" / "VERSION").read_text() == "0.3.8-rc2" and (d / ".maisim-app.antigo" / "AppRun").read_text() == "velho"
       and os.access(app / "AppRun", os.X_OK) and (d / "MaiSim" / "c.ipes").read_text() == "meu" and not (d / ".maisim-app.novo").exists(),
       "a pasta: a nova no lugar (executável), a de antes em .maisim-app.antigo, os dados de fora intocados")
    sem = pacote(d / "sem.tar.gz", {"maisim-app/leia.txt": "x"})
    try:
        A.troca_pasta(sem, app); ok(False, "um pacote sem o MaiSim: devia recusar")
    except ValueError:
        ok((app / "maisim" / "VERSION").read_text() == "0.3.8-rc2", "um pacote sem o MaiSim dentro (sem o AppRun): recusado, nada trocado")
    mau = pacote(d / "mau.tar.gz", {"maisim-app/AppRun": "x", "maisim-app/maisim/VERSION": "9", "../fora.txt": "invadiu"})
    try:
        A.troca_pasta(mau, app); ok(False, "um pacote com ../: devia recusar")
    except Exception:                                    # noqa: BLE001 (o filtro "data" do tarfile)
        ok(not (d / "fora.txt").exists() and (app / "maisim" / "VERSION").read_text() == "0.3.8-rc2", "um pacote com um caminho para fora (../): recusado, nada escrito fora")
    os.environ["MAISIM_DADOS"] = str(app / "MaiSim")
    ok(A.dados_na_pasta(app), "os dados dentro da pasta do programa (a 0.3.8-rc1 em ~/MaiSim): a trava pega")
    os.environ["MAISIM_DADOS"] = str(d / "MaiSim")
    ok(not A.dados_na_pasta(app), "os dados em ~/MaiSim, fora da pasta do programa: pode atualizar")
    os.environ.pop("MAISIM_DADOS", None)
print("OK" if not falhas else f"FALHA: {falhas}")
sys.exit(1 if falhas else 0)
