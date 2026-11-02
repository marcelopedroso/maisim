#!/data/data/com.termux/files/usr/bin/bash
# O MaiSim no Android (experimental), num comando só, no Termux (o do F-Droid ou do GitHub: o da Play Store está parado):
#   curl -fsSL https://raw.githubusercontent.com/marcelopedroso/maisim/main/pacote/android/instala.sh | bash
# Instala o proot-distro e um Ubuntu dentro do Termux (o MaiSim precisa das bibliotecas comuns do Linux, que o Termux puro não
# tem), baixa a versão ARM mais nova do MaiSim (MaiSim-<v>-aarch64.tar.gz, conferido pelo SHA-256) para ~/maisim-app dentro
# do Ubuntu (os circuitos ficam em ~/MaiSim, fora: o botão Atualizar troca só o programa), o que ele precisa do sistema (a
# tela virtual, as bibliotecas de janela do Java) e cria o comando "maisim" no Termux (e o atalho do Termux:Widget, em
# ~/.shortcuts/MaiSim). Depois: digite maisim e abra http://localhost:7100 no navegador do celular.
# Rodar de novo é seguro: reinstala o MaiSim (os circuitos ficam). MAISIM_VERSAO=0.3.8-rc2 escolhe uma versão.
set -euo pipefail
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in pt*) PT=1;; *) PT=;; esac
fala() { if [ -n "$PT" ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
REPO=marcelopedroso/maisim

if [ -z "${PREFIX:-}" ] || [ "${PREFIX#/data/data/com.termux}" = "$PREFIX" ]; then
  if [ -f /etc/os-release ] && grep -qi ubuntu /etc/os-release && [ "$(id -u)" = 0 ]; then
    fala "maisim: você está dentro do Ubuntu. Saia (digite exit) e rode este instalador no Termux." \
         "maisim: you are inside Ubuntu. Leave it (type exit) and run this installer in Termux." >&2
  else
    fala "maisim: rode este instalador no Termux do Android (o do F-Droid ou do GitHub)." \
         "maisim: run this installer in Android's Termux (the F-Droid or GitHub one)." >&2
  fi
  exit 1
fi
[ "$(uname -m)" = aarch64 ] || { fala "maisim: o MaiSim para Android é para celulares ARM de 64 bits (aarch64); este é $(uname -m)." \
                                      "maisim: MaiSim for Android is for 64-bit ARM phones (aarch64); this one is $(uname -m)." >&2; exit 1; }

fala "maisim: 1/4 o proot-distro (o Ubuntu dentro do Termux)…" "maisim: 1/4 proot-distro (Ubuntu inside Termux)…"
# o Termux inteiro atualizado antes de instalar (só o curl novo com o openssl antigo quebra: "cannot locate symbol
# SSL_set_quic_tls_early_data_enabled"); sem perguntas (os arquivos de configuração alterados ficam como estão)
export DEBIAN_FRONTEND=noninteractive
{ apt-get update -q > /dev/null 2>&1 \
  && apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold dist-upgrade > /dev/null 2>&1; } \
  || { fala "maisim: não deu para atualizar o Termux: rode  pkg upgrade  e depois este instalador de novo" \
            "maisim: could not update Termux: run  pkg upgrade  and then this installer again" >&2; exit 1; }
apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold install proot-distro curl > /dev/null
# o Ubuntu já instalado? perguntando ao próprio proot-distro (a pasta dele mudou entre versões: installed-rootfs/ubuntu
# nas antigas, containers/ubuntu/rootfs a partir da 5.x; o install recusa um container que já existe)
if ! proot-distro login ubuntu -- true > /dev/null 2>&1; then
  fala "maisim: 2/4 instalando o Ubuntu (uns 50 MB, alguns minutos)…" "maisim: 2/4 installing Ubuntu (about 50 MB, a few minutes)…"
  proot-distro install ubuntu
else
  fala "maisim: 2/4 o Ubuntu já está instalado" "maisim: 2/4 Ubuntu is already installed"
fi

fala "maisim: 3/4 procurando a versão ARM mais nova do MaiSim…" "maisim: 3/4 looking for MaiSim's newest ARM version…"
if [ -n "${MAISIM_VERSAO:-}" ]; then
  URL="https://github.com/$REPO/releases/download/v${MAISIM_VERSAO#v}/MaiSim-${MAISIM_VERSAO#v}-aarch64.tar.gz"
else   # a release mais nova (com as -rc) que tem o pacote ARM
  URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=20" \
        | grep -o "\"browser_download_url\": *\"https://github.com/$REPO/releases/download/[^\"]*-aarch64\.tar\.gz\"" \
        | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
fi
if ! printf '%s' "$URL" | grep -qE "^https://github\.com/$REPO/releases/download/v[0-9A-Za-z.+-]+/MaiSim-[0-9A-Za-z.+-]+-aarch64\.tar\.gz$"; then
  fala "maisim: não achei o pacote ARM do MaiSim (sem internet?)" "maisim: could not find MaiSim's ARM package (no internet?)" >&2; exit 1
fi
fala "maisim:     $(basename "$URL")" "maisim:     $(basename "$URL")"

fala "maisim: 4/4 baixando, conferindo e instalando dentro do Ubuntu (uns 165 MB)…" "maisim: 4/4 downloading, checking and installing inside Ubuntu (about 165 MB)…"
# (a URL já conferida acima: só letras, números e .+- do nome da versão)
proot-distro login ubuntu -- /bin/bash -c "
set -e
export DEBIAN_FRONTEND=noninteractive LC_ALL=C LANG=C
apt-get update -qq > /dev/null 2>&1
apt-get install -y -qq --no-install-recommends curl ca-certificates xvfb libxtst6 libxrender1 libxi6 libxext6 fontconfig fonts-dejavu-core > /dev/null 2>&1
cd /root
curl -fL --progress-bar -o /tmp/maisim.tar.gz '$URL'
curl -fsSL -o /tmp/maisim.sha256 '$URL.sha256'
echo \"\$(cut -d' ' -f1 /tmp/maisim.sha256)  /tmp/maisim.tar.gz\" | sha256sum -c --quiet -
rm -rf /root/.maisim-app.novo && mkdir /root/.maisim-app.novo
tar xzf /tmp/maisim.tar.gz -C /root/.maisim-app.novo
set -- /root/.maisim-app.novo/*                         # a pasta que vem no pacote (maisim-app; MaiSim na 0.3.8-rc1)
rm -rf /root/maisim-app && mv \"\$1\" /root/maisim-app && rm -rf /root/.maisim-app.novo /tmp/maisim.tar.gz /tmp/maisim.sha256
test -x /root/maisim-app/AppRun
"

# o comando maisim (e o atalho do Termux:Widget): o Ubuntu e o MaiSim de uma vez; o wake lock segura o Android de dormir o Termux
cat > "$PREFIX/bin/maisim" <<'CMD'
#!/data/data/com.termux/files/usr/bin/sh
# o MaiSim (instalado pelo pacote/android/instala.sh): no Ubuntu do Termux; abra http://localhost:7100 no navegador
termux-wake-lock 2> /dev/null || true
exec proot-distro login ubuntu -- /root/maisim-app/AppRun "$@"
CMD
chmod +x "$PREFIX/bin/maisim"
mkdir -p "$HOME/.shortcuts" && cp "$PREFIX/bin/maisim" "$HOME/.shortcuts/MaiSim" && chmod +x "$HOME/.shortcuts/MaiSim"

fala "" ""
fala "maisim: pronto! Para ligar o MaiSim, digite:   maisim" "maisim: done! To start MaiSim, type:   maisim"
fala "        e abra http://localhost:7100 no navegador do celular (para parar: CTRL + C no Termux)." \
     "        and open http://localhost:7100 in the phone's browser (to stop: CTRL + C in Termux)."
fala "        Os circuitos ficam em ~/MaiSim, dentro do Ubuntu; o botão Atualizar do MaiSim troca só o programa." \
     "        Circuits stay in ~/MaiSim, inside Ubuntu; MaiSim's Update button replaces only the program."
