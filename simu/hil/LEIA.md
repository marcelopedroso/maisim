# A placa do HIL: o controle em C numa placa de verdade, o circuito no Gecko

O controle em C de um circuito pode rodar **numa placa de verdade** — um Raspberry Pi, ou qualquer Linux com `python3` e
`gcc` — ligada ao PC pela rede, enquanto o GeckoCIRCUITS continua no PC. A cada Ts, o servidor do simu manda as medidas à
placa e recebe as atuações: o mesmo protocolo dos controladores de sempre (`carrega`, `passo`, `parametros`, o
`controle_worker_c.py`), só que por TCP. O laço da rodada, o Scope e a comparação não sabem a diferença.

É o **processador no laço (PIL)**: o `controle.c` é compilado pelo `gcc` da placa e roda nela, com a aritmética dela, em
malha fechada com o circuito. O tempo de cada `maisim_passo`, medido na própria placa (`CLOCK_MONOTONIC`, sem a rede), vai
ao Scope como `pil_texec_us`. **Não é tempo real**: o Gecko espera a placa a cada amostra (quem dita a duração da rodada é
a rede).

```
 PC (MaiSim)                                        a placa (simu/hil/placa.py)
 Gecko ── servidor ── Trabalhador(placa=True) ── TCP ──▶ controle_worker_c.py (gcc, um núcleo só dele)
                                      ◀── atuações + Scope + pil_texec_us
```

## 1. A placa (uma vez)

Do PC (Linux, WSL ou o Git Bash do Windows), com acesso por `ssh` à placa:

```bash
simu/hil/instala_placa.sh usuario@placa --servico
```

Leva à placa só o que o controle precisa (o `placa.py`, os workers, o contrato do C, os textos), gera a chave dela
(`~/.config/maisim_hil/chave`, 0600), põe o `placa.py` para subir com a placa (`@reboot` no crontab) e mostra as duas
linhas do `.env` do PC. À mão, na placa: `python3 simu/hil/placa.py --gera-chave` e `python3 simu/hil/placa.py --host <IP>`.

O `placa.py` escuta só no IP dado (o padrão: o do Tailscale); cada controlador roda num núcleo só dele (`--nucleos 3,2,1`)
e, com permissão (root ou `CAP_SYS_NICE`), em SCHED_FIFO. O `controle.log` de cada rodada fica na placa, em
`~/.cache/maisim_hil/rodadas/<data>/`. Se o PC some no meio da rodada (MaiSim fechado, rede caída), o controle é encerrado
na placa — mesmo preso num laço infinito.

## 2. O PC

No `.env` da raiz (no MaiSim instalado no Windows: `%APPDATA%\MaiSim\maisim.env`):

```
MAISIM_HIL=100.103.94.6:7190
MAISIM_HIL_CHAVE=<a chave da placa>
```

A placa é do computador, não do circuito: o endereço e a chave nunca vão para o `.controle.json`.

## 3. No painel do Controle

Na visão **C**, com uma placa configurada, aparece **na placa** ao lado da precisão. Marcada, ela fica guardada no
controle (`c.placa`), o painel mostra se a placa está no ar e o que ela é (o modelo e o `gcc`), e as rodadas rodam o C nela.
Com vários controladores, cada um vai num núcleo da placa. O **testar** do painel roda sempre no PC (não depende da placa).

Pela API: `GET editor/controle/placa` (o estado da placa) e `POST editor/rodar {…, "linguagem": "placa"}` (esta rodada na
placa, sem mudar o guardado; `"c"` roda o C no PC e `"python"` o Python — para comparar).

## 4. O que se mede (Raspberry Pi 3 Model B, pelo Wi-Fi e Tailscale, 14/11/2026)

O `exemplo_controle_pwm` (o buck com PWM e PI no código, Ts = 2 µs, 10 ms): o C na placa sai **igual bit a bit** ao C no
PC e ao Python (as contas na mesma ordem dão o mesmo double, também no ARM).

| | mediana | p99 | máx |
|---|---|---|---|
| `maisim_passo` na placa (`pil_texec_us`) | 4,1 µs | 6,3 µs | 50 µs |
| ida e volta PC ↔ placa (Wi-Fi) | 6,4 ms | 212 ms | 525 ms |

5000 amostras em 55 s: a rede manda. Com cabo, a ida e volta cai; o piso, só de software (o JSON e o Python dos dois lados,
num Pi 3), é de ~0,7 ms.

## 5. Os testes

- `simu/validacao/placa_offline.py` (sem Gecko): o `placa.py` em 127.0.0.1 — o info, a chave errada, o C na placa igual
  ao worker local, e o controle preso encerrado quando o PC fecha a conexão.
- `simu/validacao/placa_api.py` (na instância de teste, que aponta `MAISIM_HIL` para 127.0.0.1:7207): a rodada do buck no
  C da "placa" igual bit a bit à do C no PC, o `pil_texec_us`, o estado no painel, a placa fora do ar e a chave errada.

## 6. Segurança

Quem tem a chave compila e roda C na placa. O `placa.py` escuta só no IP dado (nunca `0.0.0.0` por padrão), confere a
chave por HMAC nos dois sentidos (o `multiprocessing.connection`) antes de qualquer coisa, e a chave só fica na placa
(0600) e no `.env` do PC.
