"""Offline: pedido_local (cabeçalhos) e _le_login (saída do CLI imitada), sem servidor nem login de verdade."""
import sys, subprocess, importlib.util, time
P = str(__import__("pathlib").Path(__file__).resolve().parents[1])   # simu/; sys.path.insert(0, P)
spec = importlib.util.spec_from_file_location("srv", P + "/servidor.py"); srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)
srv.PORTAS_PAGINA.add(8767)
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
class H:
    def __init__(self, **h): self.headers = {k.replace("_", "-"): v for k, v in h.items()}
casos = [("página do PEW pelo Vite (POST)", dict(Host="localhost:8767", Origin="http://localhost:5000", Sec_Fetch_Site="same-origin", X_PEW="1"), True, True),
         ("página direto no servidor (POST)", dict(Host="localhost:8767", Origin="http://localhost:8767", Sec_Fetch_Site="same-origin", X_PEW="1"), True, True),
         ("GET da própria página (sem Origin)", dict(Host="127.0.0.1:8767", Sec_Fetch_Site="same-origin"), False, True),
         ("curl local (sem Origin nem Sec-Fetch)", dict(Host="localhost:8767", X_PEW="1"), True, True),
         ("IPv6 [::1]", dict(Host="[::1]:8767", Origin="http://[::1]:5000", X_PEW="1"), True, True),
         ("outra porta de localhost", dict(Host="localhost:8767", Origin="http://localhost:3000", Sec_Fetch_Site="same-site", X_PEW="1"), True, False),
         ("outra porta, sem Sec-Fetch", dict(Host="localhost:8767", Origin="http://localhost:3000", X_PEW="1"), True, False),
         ("Origin null", dict(Host="localhost:8767", Origin="null", X_PEW="1"), True, False),
         ("site de fora", dict(Host="localhost:8767", Origin="https://evil.example", Sec_Fetch_Site="cross-site", X_PEW="1"), True, False),
         ("Sec-Fetch same-site sem Origin (GET)", dict(Host="localhost:8767", Sec_Fetch_Site="same-site"), False, False),
         ("DNS rebinding (Host de fora)", dict(Host="evil.example:8767"), False, False),
         ("sem Host", dict(), False, False),
         ("POST sem X-PEW", dict(Host="localhost:8767", Origin="http://localhost:5000"), True, False)]
for nome, h, post, esperado in casos:
    ok(srv.pedido_local(H(**h), post) == esperado, f"pedido_local: {nome} → {'aceito' if esperado else 'recusado'}")
def falso(saida, codigo):
    script = f"import sys,time; sys.stdout.write({saida!r}); sys.stdout.flush(); time.sleep(0.2); sys.exit({codigo})"
    return subprocess.Popen([sys.executable, "-c", script], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
URL = "https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=abc"
for nome, saida, cod, espera in [
        ("sucesso", f"Opening browser to sign in…\nIf the browser didn't open, visit: \x1b]8;;{URL}\x07{URL}\x1b]8;;\x07\nPaste code here if prompted > Login successful.\n", 0, ("login feito", None)),
        ("falha colada no prompt", f"Opening browser to sign in…\nIf the browser didn't open, visit: {URL}\nPaste code here if prompted > Login failed: Request failed with status code 400\n", 1, (None, "Login failed: Request failed with status code 400"))]:
    p = falso(saida, cod); srv.claude_login.clear(); srv.claude_login.update(proc=p, andamento=True, url_manual=None, erro=None, mensagem=None)
    srv._le_login(p)
    l = srv.claude_login
    ok(l["url_manual"] == URL and (l["mensagem"], l["erro"]) == espera and not l["andamento"], f"_le_login {nome}: url {l['url_manual'] == URL}, mensagem {l['mensagem']!r}, erro {l['erro']!r}")
print("falhas:", falhas)
