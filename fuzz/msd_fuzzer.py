"""Fuzzing do leitor de .msd (simu/msd.py, msd.le): o arquivo que leva um circuito, os subcircuitos e as rodadas de uma
máquina para outra, e que pode vir de qualquer pessoa. Ele confere tudo antes de gravar e recusa o que não serve com um
ValueError (a mensagem para a tela). Qualquer outra exceção, ou travar, é um defeito: é o que o fuzzer procura, com zips
de verdade montados a partir dos bytes (o manifest, os nomes e o conteúdo) e também com bytes soltos.
(Roda no ClusterFuzzLite: .clusterfuzzlite/; à mão: python3 fuzz/msd_fuzzer.py, com o atheris instalado.)"""
import io, json, os, sys, zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(AQUI, "..", "simu"), os.path.join(AQUI, "..", "config")]

import atheris  # noqa: E402

with atheris.instrument_imports():
    import msd  # noqa: E402


def zip_de(fdp):
    """Um .msd montado pelo fuzzer: um manifest (às vezes válido no formato) e alguns arquivos com nomes e bytes dele."""
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        man = {"formato": msd.FORMATO if fdp.ConsumeBool() else fdp.ConsumeUnicodeNoSurrogates(12),
               "versao": fdp.ConsumeIntInRange(-2, msd.VERSAO + 2), "circuito": fdp.ConsumeUnicodeNoSurrogates(40),
               "arquivos": {}}
        for _ in range(fdp.ConsumeIntInRange(0, 6)):
            nome = fdp.ConsumeUnicodeNoSurrogates(30) or "x"
            dados = fdp.ConsumeBytes(fdp.ConsumeIntInRange(0, 2048))
            man["arquivos"][nome] = fdp.ConsumeUnicodeNoSurrogates(64)
            try:
                z.writestr(nome, dados)
            except Exception:              # (o zipfile recusa alguns nomes ao montar: é só a montagem do teste)
                pass
        texto = json.dumps(man) if fdp.ConsumeBool() else fdp.ConsumeUnicodeNoSurrogates(200)
        z.writestr("manifest.json", texto)
    return b.getvalue()


def TestOneInput(data):
    fdp = atheris.FuzzedDataProvider(data)
    arquivo = zip_de(fdp) if fdp.ConsumeBool() else fdp.ConsumeBytes(fdp.remaining_bytes())
    try:
        msd.le(arquivo)
    except ValueError:                     # a recusa esperada (o arquivo não serve): a mensagem vai para a tela
        pass


def main():
    atheris.Setup(sys.argv, TestOneInput)
    atheris.Fuzz()


if __name__ == "__main__":
    main()
