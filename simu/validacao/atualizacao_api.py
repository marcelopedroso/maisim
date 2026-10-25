"""A versão e a atualização pela API (instância de teste 7201; as releases de mentira do config/teste.env,
dados/releases_teste.json): a situação (a versão do VERSION, código-fonte, o canal, a 9.9.0 estável), o canal teste (a
9.9.1-rc1) e de volta, o atualizar recusado na versão de programador (o "git pull"; nada é baixado), e as rotas só da
página do MaiSim (o POST sem o X-MaiSim e o GET de outra origem: recusados). No fim, o canal volta ao de antes."""
import json, re, urllib.request
from pathlib import Path
R = Path(__file__).resolve().parents[2]


def porta():                                             # a do simu no perfil de teste (config/teste.env)
    m = re.search(r"^MAISIM_PORTA_SIMU=(\d+)", (R / "config/teste.env").read_text(), re.M)
    return int(m.group(1)) if m else 7201


B = f"http://localhost:{porta()}/maisim/simu/"


def api(rota, corpo=None, cab=None):
    h = {"Content-Type": "application/json", **({"X-MaiSim": "1"} if corpo is not None else {}), **(cab or {})}
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={k: v for k, v in h.items() if v})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=30).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


antes = api("atualizacao").get("canal", "estavel")
try:
    api("atualizacao/canal", {"canal": "estavel"})
    s = api("atualizacao/verificar", {})
    ok(s.get("versao") == (R / "VERSION").read_text().strip() and s.get("tipo") == "fonte" and s.get("canal") == "estavel" and not s.get("sem_rede"),
       f"a situação: versão {s.get('versao')}, {s.get('tipo')}, canal {s.get('canal')}")
    n = s.get("nova") or {}
    ok(n.get("versao") == "9.9.0" and "Novidades" in n.get("notas", "") and n.get("pagina", "").startswith("https://github.com/") and "arquivo" not in n,
       f"a release nova no estável: {n.get('versao')} (com as notas; sem o endereço do arquivo)")
    t = api("atualizacao/canal", {"canal": "teste"})
    ok((t.get("nova") or {}).get("versao") == "9.9.1-rc1" and api("atualizacao").get("canal") == "teste", f"canal teste: {(t.get('nova') or {}).get('versao')}")
    ok(api("atualizacao/canal", {"canal": "beta"}).get("ERRO") == 400, "canal desconhecido: 400")
    ok((api("atualizacao/canal", {"canal": "estavel"}).get("nova") or {}).get("versao") == "9.9.0", "de volta ao estável: a 9.9.0")
    a = api("atualizacao/aplicar", {})
    ok(a.get("ERRO") == 400 and "git pull" in a.get("erro", "") and not a.get("aplicando"), f"atualizar na versão de programador: recusado ({a.get('erro')})")
    ok(api("atualizacao/aplicar", {}, {"X-MaiSim": ""}).get("ERRO") == 403, "POST sem o X-MaiSim: 403")
    ok(api("atualizacao", None, {"Origin": "http://exemplo.com"}).get("ERRO") == 403, "GET de outra origem: 403")
    en = api("atualizacao/aplicar", {}, {"Cookie": "maisim-lingua=en"})
    ok("developer version" in en.get("erro", ""), f"em inglês: {en.get('erro')}")
finally:
    api("atualizacao/canal", {"canal": antes})
print("OK" if not falhas else f"FALHA: {falhas}")
raise SystemExit(1 if falhas else 0)
