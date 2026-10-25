#!/usr/bin/env python3
"""Vistoria dos componentes da paleta do simu (instância de teste 7201), pedido de Marcelo em 24/10: os 121 itens do
static/catalogo.json (11 abas, tirados do GeckoCIRCUITS por catalogo_gecko.py) funcionam pelo caminho do MaiSim — o Gecko
escondido, mexido pelo motor do editor (simu/motor) e pelo servidor.py, rodando por editor/rodar?

Para cada item (nível 1: o componente sozinho, sem ligar nada), o mesmo caminho da página:
  1. folha em branco: POST editor/novo {"modo": "descartar"} (o "+ Novo circuito", jogando fora o que houver);
  2. inserir como a paleta (simu.js, coloca → pede): POST editor/cmd {"op": "CREATE", "args": [<id>.1, x, y, <id>]} —
     o nome é o id com o que não for letra, número ou _ trocado por _ (como a página), e o tipo é o id do catálogo (o
     _fixedIDString que o createComponent do Gecko aceita, "C DLL" com espaço inclusive); confere o elemento no estado
     que volta (o mesmo do editor/estado);
  3. parâmetros como o painel do componente: GET editor/params?nome=&dom=&typ= (o nome, o valor de cada um pelo GETP);
  4. uma rodada curta (POST editor/rodar, Δt 1 µs, 100 µs, 20 amostras), esperando pelo GET editor/rodada (a rota que a
     página e os testes consultam) até sair de preparando/rodando/pausada, com prazo por componente (60 s; depois,
     POST editor/parar). O controle fica desligado (o padrão do circuito novo). Um CONST solto (VISTORIA_SONDA) vai junto
     só para a rodada ter um sinal: sem nenhuma saída de bloco de controle na folha, o servidor recusa a rodada antes do
     Gecko (rodada.sem_medidas), e a vistoria não diria nada dos componentes de circuito;
  5. o estado depois da rodada (GET editor/estado): o elemento continua lá? o Gecko abriu janela de erro (aviso_gecko)?
Grava tmp_vistoria/vistoria.json e tmp_vistoria/vistoria.md (a tabela: aba, componente, inserido, parâmetros, rodada,
erro) e imprime o resumo. Um componente que falha não para a vistoria; no fim (também com Ctrl+C ou kill), a rodada em
andamento é parada, o editor volta ao exemplos/exemplo_buck.ipes (descartar) e as pastas de rodada da vistoria saem da
pasta de rodadas da instância de teste (--manter-rodadas as deixa).

Itens repetidos no catálogo (ADD, SUB, MUL, DIV e SGN estão em Control e em Math) rodam uma vez só; o resultado vale
para as duas abas. O SCOPE (o scope do Gecko) não aparece na paleta (regra do MaiSim: medidor vai para o /maisim/scope),
mas está no catálogo e é vistoriado (na_paleta = false); o mesmo para os "oculto" (catalogo_gecko.py, ESCONDIDOS). Nenhum item é pulado: lido o código do Gecko, nenhum construtor
abre janela nem espera nada de fora ao inserir (as janelas dos diálogos só abrem com duplo clique no Gecko); o que pode
abrir janela de erro na rodada (C/C++ sem biblioteca, exportar dados, falta de memória) cai na vigia do servidor, que a
fecha com OK e avisa (aviso_gecko, registrado aqui).

uso: python3 simu/validacao/vistoria_componentes.py [--so <trecho do nome ou id>] [--json-only] [--prazo 60]
     [--base http://localhost:7201/maisim/simu/] [--manter-rodadas]
Uma vistoria inteira leva uns minutos (116 componentes). Só na instância de teste (./sobe_teste.sh); não está no ci.sh.
"""
import argparse
import json
import re
import shutil
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]                                  # a raiz do projeto (validacao → simu → raiz)
CATALOGO = RAIZ / "simu/static/catalogo.json"
SAIDA = AQUI / "tmp_vistoria"                           # tmp_*/ fica fora do git (.gitignore)
RESTAURA = "exemplos/exemplo_buck.ipes"
RODANDO = ("preparando", "rodando", "pausada")
NOME_RODADA = "vistoria_componentes"
SONDA = "VISTORIA_SONDA"
DT, TFIM, AMOSTRAS = "1e-6", "1e-4", "20"
POS_COMP, POS_SONDA = (20, 16), (6, 6)
PULAR = {}                                              # id → motivo (nenhum hoje: ver o cabeçalho)


def le_env(arq, chave):
    """O valor de NOME=valor num config/*.env (sem o ambiente por cima: um MAISIM_* do shell não leva à instância de verdade)."""
    try:
        m = re.search(rf"^{chave}=([^\s#]+)", (RAIZ / "config" / arq).read_text(), re.M)
    except OSError:
        return None
    return m.group(1) if m else None


def porta():                                             # a do simu no perfil de teste (config/teste.env), como o destino_api.py
    v = le_env("teste.env", "MAISIM_PORTA_SIMU")
    return int(v) if v and v.isdigit() else 7201


def pasta_rodadas():
    v = le_env("teste.env", "MAISIM_RODADAS") or "~/.cache/maisim_teste/rodadas"
    return Path(v.replace("$HOME", "~", 1)).expanduser()


B = f"http://localhost:{porta()}/maisim/simu/"


def api(rota, corpo=None, prazo=180):
    """GET (sem corpo) ou POST JSON; erro HTTP ou de rede vira {"ERRO": código, "erro": texto} (nunca levanta)."""
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=prazo).read())
    except urllib.error.HTTPError as e:
        try:
            j = json.loads(e.read() or b"{}")
        except ValueError:
            j = {}
        return {"ERRO": e.code, **(j if isinstance(j, dict) else {"erro": str(j)})}
    except (urllib.error.URLError, OSError, ValueError) as e:      # sem servidor, prazo esgotado, resposta que não é JSON
        return {"ERRO": "rede", "erro": f"{type(e).__name__}: {e}"}


def erro_de(j):
    return str(j.get("erro") or j.get("ERRO") or "") if isinstance(j, dict) else ""


def estado_rodada():
    j = api("editor/rodada", prazo=30)
    return j.get("estado") if not j.get("ERRO") else None


def espera_livre(prazo):
    """Espera a rodada sair de preparando/rodando/pausada (True) ou o prazo acabar (False)."""
    fim = time.monotonic() + prazo
    while time.monotonic() < fim:
        e = estado_rodada()
        if e is not None and e not in RODANDO:
            return True
        time.sleep(0.5)
    return False


def para_rodada():
    """Para a rodada em andamento (se houver) e espera ela terminar."""
    if estado_rodada() in RODANDO:
        api("editor/parar", {}, prazo=30)
        return espera_livre(60)
    return True


def nome_de(item):
    return re.sub(r"[^A-Za-z0-9_]", "_", item["id"] or "X") + ".1"     # como a página (coloca: base + ".k")


def elementos(r):
    try:
        return r["folhas"]["0"]["elementos"]
    except (KeyError, TypeError):
        return []


def resumo_elemento(e):
    return {k: e.get(k) for k in ("nome", "tipo", "dom", "typ", "id_gecko", "entradas", "saidas", "ativo")} if e else None


def vistoria(item, prazo):
    """Um item do catálogo, do zero: folha nova, inserir, parâmetros, rodada curta, estado depois."""
    res = {"inserido": False, "params": None, "rodada": None, "avisos_gecko": []}
    nome = nome_de(item)
    res["nome_no_circuito"] = nome

    def aviso(j):
        if isinstance(j, dict) and j.get("aviso_gecko"):
            res["avisos_gecko"].append(j["aviso_gecko"])
        return j

    j = aviso(api("editor/novo", {"modo": "descartar"}))
    if j.get("ERRO"):
        res["erro_insercao"] = "editor/novo: " + erro_de(j)
        return res
    x, y = POS_COMP
    j = aviso(api("editor/cmd", {"op": "CREATE", "args": [nome, x, y, item["id"]], "descr": f"vistoria: {item['nome']}"}))
    if j.get("ERRO"):
        res["erro_insercao"] = erro_de(j)
        return res
    els = elementos(j)
    e = next((q for q in els if q.get("nome") == nome), None) or next((q for q in els if q.get("nome") != SONDA), None)
    res["elemento"] = resumo_elemento(e)
    res["inserido"] = e is not None
    if e is None:
        res["erro_insercao"] = f"o CREATE respondeu sem erro, mas {nome} não está na folha ({len(els)} elementos)"
        return res
    res["typ_confere"] = e.get("typ") == item["typ"]
    nome_el = e["nome"]
    q = f"nome={urllib.parse.quote(nome_el)}&dom={urllib.parse.quote(str(e.get('dom', '')))}&typ={e.get('typ', '')}"
    p = aviso(api("editor/params?" + q, prazo=120))
    if isinstance(p, list):
        com_erro = [x.get("nome") for x in p if "erro" in x]
        res["params"] = {"ok": not com_erro, "n": len(p), "nomes": [x.get("nome") for x in p], "com_erro": com_erro,
                         "erro": "; ".join(f"{x.get('nome')}: {x.get('erro')}" for x in p if "erro" in x)[:500]}
    else:
        res["params"] = {"ok": False, "n": 0, "nomes": [], "com_erro": [], "erro": erro_de(p)}
    sx, sy = POS_SONDA
    s = aviso(api("editor/cmd", {"op": "CREATE", "args": [SONDA, sx, sy, "CONST"], "descr": "vistoria: sonda"}))
    if s.get("ERRO"):
        res["erro_sonda"] = erro_de(s)
    t0 = time.monotonic()
    r = aviso(api("editor/rodar", {"dt": DT, "tfim": TFIM, "nome": NOME_RODADA, "amostras": AMOSTRAS}, prazo=max(prazo, 30) + 120))
    if r.get("ERRO") == "rede":                          # sem resposta: a rodada pode estar presa na preparação (INIT)
        res["rodada"] = {"estado": "sem_resposta", "erro": erro_de(r)}
        if not espera_livre(prazo) and not para_rodada():
            res["rodada"]["travou"] = True
        return res
    if r.get("ERRO"):                                    # recusada antes de começar (o servidor ou o INIT do Gecko)
        res["rodada"] = {"estado": "recusada", "erro": erro_de(r), "segundos": round(time.monotonic() - t0, 2)}
    else:
        while r.get("estado") in RODANDO and time.monotonic() - t0 < prazo:
            time.sleep(0.3)
            r2 = api("editor/rodada", prazo=30)
            if not r2.get("ERRO"):
                r = r2
        esgotou = r.get("estado") in RODANDO
        if esgotou:
            api("editor/parar", {}, prazo=30)
            if espera_livre(60):
                r2 = api("editor/rodada", prazo=30)
                r = r2 if not r2.get("ERRO") else r
        res["rodada"] = {"estado": "tempo_esgotado" if esgotou else r.get("estado"), "estado_final": r.get("estado"),
                         "erro": str(r.get("erro") or ""), "segundos": round(time.monotonic() - t0, 2),
                         "t": r.get("t"), "amostras": r.get("amostras"), "sinais": r.get("sinais"), "avisos": r.get("avisos") or [],
                         "arquivo": r.get("arquivo")}
        if esgotou and r.get("estado") in RODANDO:
            res["rodada"]["travou"] = True
            return res
    d = aviso(api("editor/estado", prazo=120))
    if d.get("ERRO"):
        res["estado_depois"] = "editor/estado: " + erro_de(d)
    else:
        res["continua_na_folha"] = any(q.get("nome") == nome_el for q in elementos(d))
    return res


def celula(x, n=220):
    s = re.sub(r"\s+", " ", str(x or "")).strip().replace("|", "\\|")
    return s if len(s) <= n else s[:n - 1] + "…"


def texto_params(p):
    if not p:
        return "—"
    if p.get("erro") and not p.get("n"):
        return "erro"
    return f"{p['n']}" + (f" ({len(p['com_erro'])} com erro)" if p.get("com_erro") else "")


def texto_erro(r):
    partes = [r.get("pulado"), r.get("erro_insercao"), r.get("erro_sonda") and "sonda: " + r["erro_sonda"]]
    if r.get("params") and r["params"].get("erro"):
        partes.append("parâmetros: " + r["params"]["erro"])
    rod = r.get("rodada") or {}
    partes.append(rod.get("erro"))
    partes += [f"aviso: {a}" for a in rod.get("avisos") or []][:2]
    partes += [f"Gecko: {a}" for a in r.get("avisos_gecko") or []]
    if r.get("continua_na_folha") is False:
        partes.append("o componente sumiu da folha depois da rodada")
    if r.get("typ_confere") is False:
        partes.append(f"typ no arquivo {(r.get('elemento') or {}).get('typ')} ≠ catálogo {r['typ']}")
    return " · ".join(p for p in partes if p)


def situacao(r):
    if r.get("pulado"):
        return "pulado"
    if r.get("nao_testado"):
        return "nao_testado"
    if not r.get("inserido"):
        return "nao_inseriu"
    return (r.get("rodada") or {}).get("estado") or "sem_rodada"


def resumo(itens):
    cont = {}
    for r in itens:
        cont[situacao(r)] = cont.get(situacao(r), 0) + 1
    unicos = [r for r in itens if not r.get("repetido_de")]
    return {"itens": len(itens), "unicos": len(unicos), "por_situacao": cont,
            "unicos_por_situacao": {k: sum(1 for r in unicos if situacao(r) == k) for k in sorted({situacao(r) for r in unicos})},
            "inseridos": sum(1 for r in itens if r.get("inserido")),
            "params_ok": sum(1 for r in itens if (r.get("params") or {}).get("ok"))}


def grava(dados, json_only):
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "vistoria.json").write_text(json.dumps(dados, ensure_ascii=False, indent=1))
    if json_only:
        return
    s = dados["resumo"]
    linhas = ["# Vistoria dos componentes da paleta do simu", "",
              f"{dados['quando']} · {dados['base']} · Δt {DT} s, tfim {TFIM} s, {AMOSTRAS} amostras · prazo {dados['prazo']} s"
              + (f" · filtro --so {dados['so']!r}" if dados.get("so") else "") + (" · **interrompida**" if dados.get("interrompida") else ""),
              "", "Nível 1: cada componente sozinho numa folha nova (sem ligar nada), com um CONST solto (sonda) para a rodada ter um sinal.",
              "", "| situação | itens | únicos |", "|---|---|---|"]
    for k in sorted(s["por_situacao"]):
        linhas.append(f"| {k} | {s['por_situacao'][k]} | {s['unicos_por_situacao'].get(k, 0)} |")
    linhas += ["", f"Inseridos: {s['inseridos']} de {s['itens']} · parâmetros lidos sem erro: {s['params_ok']}", "",
               "| aba | componente | id | inserido | parâmetros | rodada | erro / aviso |", "|---|---|---|---|---|---|---|"]
    for r in dados["itens"]:
        rod = situacao(r) if not r.get("inserido") else (r.get("rodada") or {}).get("estado", "—")
        nome = r["nome"] + ("" if r.get("na_paleta", True) else " (fora da paleta)") + (f" (= {r['repetido_de']})" if r.get("repetido_de") else "")
        linhas.append(f"| {celula(r['aba'])} | {celula(nome)} | `{celula(r['id'])}` | {'sim' if r.get('inserido') else 'não'} | "
                      f"{texto_params(r.get('params'))} | {rod} | {celula(texto_erro(r), 400)} |")
    (SAIDA / "vistoria.md").write_text("\n".join(linhas) + "\n")


def rodadas_da_vistoria():
    """As pastas de rodada de vistorias (data_hora_vistoria_componentes), só na pasta de rodadas da instância de teste."""
    pasta = pasta_rodadas()
    if "maisim_teste" not in str(pasta) or not pasta.is_dir():
        return set()
    padrao = re.compile(r"^\d{4}-\d\d-\d\d_\d{6}_" + re.escape(NOME_RODADA) + "$")
    return {d for d in pasta.iterdir() if d.is_dir() and padrao.match(d.name)}


def limpa_rodadas(antes):
    """Apaga só as pastas de rodada criadas por esta vistoria: as de antes (de uma vistoria com --manter-rodadas) ficam."""
    novas = rodadas_da_vistoria() - antes
    for d in novas:
        shutil.rmtree(d, ignore_errors=True)
    return len(novas)


def main():
    global B
    ap = argparse.ArgumentParser(description="Vistoria dos componentes da paleta do simu (instância de teste).")
    ap.add_argument("--so", default="", help="só os itens com este trecho no nome ou no id (sem diferença de maiúsculas)")
    ap.add_argument("--json-only", action="store_true", help="grava só o vistoria.json (sem a tabela em Markdown)")
    ap.add_argument("--prazo", type=float, default=60.0, help="segundos por rodada antes de parar (padrão 60)")
    ap.add_argument("--base", default=B, help=f"o endereço do simu (padrão {B}, a porta do config/teste.env)")
    ap.add_argument("--manter-rodadas", action="store_true", help="não apaga as pastas de rodada da vistoria no fim")
    a = ap.parse_args()
    B = a.base if a.base.endswith("/") else a.base + "/"
    real = le_env("padrao.env", "MAISIM_PORTA_SIMU")
    if real and re.search(rf":{real}/", B):
        sys.exit(f"{B} é o simu de verdade (porta {real}, config/padrao.env): a vistoria só roda na instância de teste")

    def termina(sig, _):
        raise KeyboardInterrupt(f"sinal {sig}")
    signal.signal(signal.SIGTERM, termina)

    antes = rodadas_da_vistoria()                       # as de vistorias de antes (--manter-rodadas) não saem no fim
    cat = json.loads(CATALOGO.read_text())
    todos = [dict(it, aba=ab["aba"]) for ab in cat["abas"] for it in ab["itens"]]
    so = a.so.lower()
    itens = [it for it in todos if not so or so in it["nome"].lower() or so in it["id"].lower()]
    if not itens:
        sys.exit(f"nenhum item do catálogo com {a.so!r}")
    aberto = api("editor/aberto", prazo=15)
    if aberto.get("ERRO"):
        sys.exit(f"sem o simu em {B}: {erro_de(aberto)} (suba a instância de teste: simu/validacao/sobe_teste.sh)")
    if estado_rodada() in RODANDO:
        sys.exit("há uma rodada em andamento na instância de teste: espere ela terminar e rode de novo")
    print(f"vistoria de {len(itens)} itens ({len({(i['dom'], i['typ'], i['id']) for i in itens})} únicos) em {B}", flush=True)

    feitos, saida, interrompida = {}, [], False
    try:
        for k, it in enumerate(itens, 1):
            r = {kk: it[kk] for kk in ("aba", "nome", "id", "enum", "classe", "dom", "typ")}
            r["na_paleta"] = it["id"] != "SCOPE" and not it.get("oculto")
            chave = (it["dom"], it["typ"], it["id"])
            if chave in feitos:
                base = feitos[chave]
                r.update({kk: v for kk, v in base.items() if kk not in r or kk == "na_paleta"}, repetido_de=base["aba"])
            elif it["id"] in PULAR:
                r["pulado"] = PULAR[it["id"]]
            else:
                t0 = time.monotonic()
                try:
                    r.update(vistoria(it, a.prazo))
                except KeyboardInterrupt:
                    raise
                except Exception as e:                   # um erro do próprio script não para a vistoria
                    r["erro_insercao"] = r.get("erro_insercao") or f"erro na vistoria: {type(e).__name__}: {e}"
                r["segundos"] = round(time.monotonic() - t0, 2)
                feitos[chave] = r
            saida.append(r)
            rod = r.get("rodada") or {}
            print(f"[{k:3}/{len(itens)}] {it['aba'][:12]:12} {it['nome'][:34]:34} {situacao(r):14} {celula(texto_erro(r), 110)}", flush=True)
            if rod.get("travou"):
                print("a rodada não terminou nem com editor/parar: o Gecko parece preso; a vistoria para aqui", flush=True)
                interrompida = True
                break
    except KeyboardInterrupt as e:
        interrompida = True
        print(f"\ninterrompida ({e or 'Ctrl+C'}): parando a rodada e voltando o editor", flush=True)
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)   # a arrumação do fim não é interrompida
        feitas = {(r["aba"], r["id"]) for r in saida}
        for it in itens:
            if (it["aba"], it["id"]) not in feitas:
                saida.append(dict({kk: it[kk] for kk in ("aba", "nome", "id", "enum", "classe", "dom", "typ")},
                                  na_paleta=it["id"] != "SCOPE" and not it.get("oculto"), nao_testado=True))
        livre = para_rodada()
        volta = api("editor/abrir", {"arq": RESTAURA, "modo": "descartar"}) if livre else {"ERRO": "ocupado", "erro": "rodada presa"}
        if volta.get("ERRO"):
            print(f"não consegui voltar o editor ao {RESTAURA}: {erro_de(volta)}", flush=True)
        apagadas = 0 if a.manter_rodadas else limpa_rodadas(antes)
        dados = {"quando": time.strftime("%Y-%m-%d %H:%M:%S"), "base": B, "dt": DT, "tfim": TFIM, "amostras": AMOSTRAS,
                 "prazo": a.prazo, "so": a.so, "interrompida": interrompida, "editor_restaurado": not volta.get("ERRO"),
                 "rodadas_apagadas": apagadas, "resumo": resumo(saida), "itens": saida}
        grava(dados, a.json_only)
        s = dados["resumo"]
        print(f"\n{s['itens']} itens ({s['unicos']} únicos): inseridos {s['inseridos']}, parâmetros sem erro {s['params_ok']}")
        print("por situação (únicos): " + ", ".join(f"{k} {v}" for k, v in sorted(s["unicos_por_situacao"].items())))
        print(f"resultado: {SAIDA / 'vistoria.json'}" + ("" if a.json_only else f" e {SAIDA / 'vistoria.md'}"))
    return 1 if interrompida else 0


if __name__ == "__main__":
    raise SystemExit(main())
