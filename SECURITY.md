# Security policy

MaiSim runs on your own machine: a local web page, a local simulator and, optionally, an AI account that you connect.
It listens only on `127.0.0.1` and accepts requests only from its own pages.

## Supported versions

Security fixes go into the latest release (see [Releases](https://github.com/marcelopedroso/maisim/releases/latest)).
Installing a newer version over the old one keeps your circuits and settings, so please update before reporting.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
([direct link](https://github.com/marcelopedroso/maisim/security/advisories/new)).

Include what you found, how to reproduce it, the MaiSim version and your operating system. You will get an answer as
soon as possible; once a fix is released, the advisory is published with credit to you (unless you prefer otherwise).

## Verifying a download

Every package attached to a release (the Windows installer, the AppImages, the Android APK) has a `.sha256` file next to
it and a build provenance attestation signed by GitHub: it proves the file was built by this repository's Actions, from
the tagged commit. With the [GitHub CLI](https://cli.github.com):

```
gh attestation verify MaiSim-Setup.exe --repo marcelopedroso/maisim
```

Releases up to 0.6.1 were published before the attestations existed. Their files were signed afterwards by this
repository's workflow (`<file>.sigstore.json`, a keyless Sigstore signature): it proves the file is the one this
repository published, not how it was built. With [cosign](https://docs.sigstore.dev):

```
cosign verify-blob --bundle MaiSim-Setup.exe.sigstore.json \
  --certificate-identity-regexp 'https://github.com/marcelopedroso/maisim/.github/workflows/assina-versoes.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com MaiSim-Setup.exe
```

---

# Política de segurança (português)

O MaiSim roda na sua máquina, escuta só em `127.0.0.1` e só aceita pedidos das próprias páginas. As correções de
segurança vão para a versão mais recente.

**Para relatar uma falha de segurança, não abra uma issue pública.** Use o canal privado do GitHub: **Security → Report
a vulnerability** neste repositório ([link direto](https://github.com/marcelopedroso/maisim/security/advisories/new)),
com o que você achou, como reproduzir, a versão do MaiSim e o sistema.

**Conferir um download:** cada pacote da Release tem o `.sha256` e um atestado de procedência assinado pelo GitHub (o
arquivo foi montado pelo Actions deste repositório, a partir do commit da versão):
`gh attestation verify MaiSim-Setup.exe --repo marcelopedroso/maisim`. As versões até a 0.6.1 saíram antes dos atestados: os arquivos
delas foram assinados depois pelo workflow do repositório (o `.sigstore.json`), o que prova que são os que o repositório
publicou, mas não como foram montados.
