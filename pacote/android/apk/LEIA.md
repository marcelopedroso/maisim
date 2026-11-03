# MaiSim para Android (o APK, pacote `app.maisim`)

O celular mínimo: Android 10+ (minSdk 29), ARM de 64 bits (só arm64-v8a; o instalador do Android recusa os outros),
1,5 GB livres com a IA, 4 GB de RAM (3 GB no mínimo; abaixo disso o app avisa) e internet na primeira abertura; sem espaço
para o que falta montar, a preparação para com a mensagem, antes de baixar.

Um app que traz o proot (o Linux sem root do Termux) e, na primeira abertura, baixa e monta o Ubuntu Base 24.04 (arm64) e
o MaiSim ARM desta versão (`MaiSim-<versão>-aarch64.tar.gz`, conferido pelo SHA-256), e mostra a tela do celular
(`/movel.html`) numa WebView. Um serviço em primeiro plano mantém o MaiSim ligado; os circuitos ficam fora do Ubuntu
(`files/MaiSim`), e o botão Atualizar do MaiSim troca só o programa. Sem Termux.

Montar (precisa do JDK 17 e do Android SDK; `ANDROID_HOME` ou `local.properties` com `sdk.dir`):

    ./proot.sh                    # o proot e o loader, conferidos (jniLibs; fora do git)
    ./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk (a chave de teste)

A versão do app é o `VERSION` do MaiSim. No CI (`.github/workflows/pacotes.yml`, job android) o `assembleRelease` assina
com a chave oficial (os segredos `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_SENHA`, `ANDROID_CHAVE_NOME`,
`ANDROID_CHAVE_SENHA`) e confere a impressão digital contra `chave.sha256` (a registrada no Android Developer Console)
antes de anexar o `MaiSim-Android-<versão>.apk` à release. Terceiros: `NOTICE.md`.
