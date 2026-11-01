"""Os furos que um site qualquer aberto no navegador explorava, fechados (Marcelo, 01/11: "temos que executar já"), na
instância de teste (a página 7200 → simu 7201, scope 7202), por um socket cru (o urllib corrigiria os pedidos tortos):
- o Host do pedido tem de ser o desta porta em localhost (o DNS rebinding: um site no nome de 127.0.0.1 lia os GETs);
- o cabeçalho estrito: Host em dobro, uma quebra de linha solta (o cabeçalho escondido que chegava aos módulos), linha
  dobrada, alvo absoluto, Content-Length com Transfer-Encoding: 400;
- o websocket só para a tela do Gecko e só da própria página (de outra origem ou sem Origin: 403; para o simu: 403);
- a senha da tela do Gecko só para a própria página (sem o X-MaiSim ou de outra origem: 403);
- o scope: o /apagar sem o X-MaiSim ou de outra origem (o POST "no-cors" de um site) e o /publicar que não é JSON, vem de
  outra origem ou de outro site: 403; a página (com o X-MaiSim) e a publicação do simu (JSON, sem Origin) seguem;
- direto nas portas do simu e do scope (sem a página), outro Host: 421; o sinal de vida de outro site: 403;
- o cabeçalho que não termina (devagar de propósito) derruba a conexão depois do prazo;
- o motor (as linhas do corpo de um POST de um site viravam comandos), num motor só deste teste (compilado do código de
  agora): um pedido HTTP e uma 1ª linha com bytes de controle (TLS, STUN) caem sem resposta; uma conexão muda cai em ~5 s
  e não segura a fila;
- se a máquina tem o x11vnc e o Xvfb: a tela com -passwdfile pede senha (o tipo 2 do RFB, não o 1, sem senha)."""
import json, os, shutil, socket, subprocess, sys, tempfile, time
from pathlib import Path
PAG, SIMU, SCOPE, GECKO = 7200, 7201, 7202, 7203
R = Path(__file__).resolve().parents[2]
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def cru(dados, porta=PAG, espera=10):
    """Manda bytes crus e devolve o código da resposta (0 se a conexão caiu sem resposta)."""
    s = socket.create_connection(("127.0.0.1", porta), timeout=espera)
    try:
        s.sendall(dados)
        r = b""
        while b"\r\n" not in r:
            x = s.recv(4096)
            if not x:
                break
            r += x
        return int(r.split(b" ", 2)[1]) if r.startswith(b"HTTP/") else 0
    except (socket.timeout, ConnectionResetError):
        return 0
    finally:
        s.close()
def pedido(metodo, alvo, cab=(), corpo=b"", host=f"localhost:{PAG}", porta=PAG):
    linhas = [f"{metodo} {alvo} HTTP/1.1", f"Host: {host}"] + list(cab)
    if corpo or metodo == "POST":
        linhas.append(f"Content-Length: {len(corpo)}")
    return cru(("\r\n".join(linhas) + "\r\n\r\n").encode("latin-1") + corpo, porta)
LOCAL, MAU = f"Origin: http://localhost:{PAG}", "Origin: http://site-mau.example"
WS = ["Connection: Upgrade", "Upgrade: websocket", "Sec-WebSocket-Version: 13", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="]
# o Host
ok(pedido("GET", "/") == 200 and pedido("GET", "/", host=f"127.0.0.1:{PAG}") == 200, "o Host desta porta em localhost (e 127.0.0.1): 200")
ok(pedido("GET", "/") == 200 and pedido("GET", "/maisim/simu/editor/estado", host="site-mau.example") == 421 and pedido("GET", "/", host="localhost:9") == 421,
   "outro Host (o DNS rebinding) ou outra porta: 421")
# o cabeçalho estrito
casos = {"Host em dobro": b"GET / HTTP/1.1\r\nHost: localhost:%d\r\nHost: site-mau.example\r\n\r\n" % PAG,
         "uma quebra de linha solta (o cabeçalho escondido)": b"GET /maisim/simu/editor/estado HTTP/1.1\r\nHost: localhost:%d\r\nFoo: a\nX-MaiSim: 1\r\n\r\n" % PAG,
         "linha dobrada": b"GET / HTTP/1.1\r\nHost: localhost:%d\r\nFoo: a\r\n X-MaiSim: 1\r\n\r\n" % PAG,
         "alvo absoluto": b"GET http://site-mau.example/ HTTP/1.1\r\nHost: localhost:%d\r\n\r\n" % PAG,
         "Content-Length com Transfer-Encoding": b"POST /maisim/scope/apagar HTTP/1.1\r\nHost: localhost:%d\r\nContent-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n{}" % PAG,
         "nome de campo com espaço": b"GET / HTTP/1.1\r\nHost: localhost:%d\r\nX MaiSim: 1\r\n\r\n" % PAG}
for nome, b in casos.items():
    ok(cru(b) == 400, f"{nome}: 400")
# o websocket
ok(pedido("GET", "/maisim/gecko/websockify", WS + [MAU]) == 403, "o websocket da tela do Gecko de outra origem: 403")
ok(pedido("GET", "/maisim/gecko/websockify", WS) == 403, "o websocket da tela sem Origin: 403")
ok(pedido("GET", "/maisim/simu/editor/estado", WS + [LOCAL]) == 403, "websocket para o simu: 403")
st = pedido("GET", "/maisim/gecko/websockify", WS + [LOCAL])
ok(st in (101, 502), f"o websocket da tela vindo da própria página passa ({st}: 101 com a tela no ar, 502 sem)")
# a senha da tela
ok(pedido("GET", "/maisim/gecko-senha") == 403 and pedido("GET", "/maisim/gecko-senha", ["X-MaiSim: 1", MAU]) == 403
   and pedido("GET", "/maisim/gecko-senha", ["X-MaiSim: 1", "Sec-Fetch-Site: cross-site"]) == 403,
   "a senha da tela sem o X-MaiSim, de outra origem ou de outro site: 403")
st = pedido("GET", "/maisim/gecko-senha", ["X-MaiSim: 1", LOCAL, "Sec-Fetch-Site: same-origin"])
ok(st in (200, 404), f"a senha da tela para a própria página: {st} (404 sem a tela no ar)")
# o scope
corpo = b'{"arqs": []}'
ok(pedido("POST", "/maisim/scope/apagar", [MAU, "Content-Type: text/plain"], corpo) == 403, "o /apagar de outro site (o POST no-cors, sem o X-MaiSim): 403")
ok(pedido("POST", "/maisim/scope/apagar", [LOCAL, "Content-Type: application/json"], corpo) == 403, "o /apagar sem o X-MaiSim, mesmo da página: 403")
ok(pedido("POST", "/maisim/scope/apagar", [MAU, "X-MaiSim: 1", "Content-Type: application/json"], corpo) == 403, "o /apagar com o X-MaiSim, mas de outra origem: 403")
ok(pedido("POST", "/maisim/scope/apagar", [LOCAL, "X-MaiSim: 1", "Content-Type: application/json", "Sec-Fetch-Site: same-origin"], corpo) == 200,
   "o /apagar da página (com o X-MaiSim): 200")
pub = b'{"tipo": "nenhum"}'
ok(pedido("POST", "/maisim/scope/publicar", ["Content-Type: text/plain"], pub) == 403, "o /publicar que não é JSON (o que um POST no-cors consegue): 403")
ok(pedido("POST", "/maisim/scope/publicar", ["Content-Type: application/json", MAU], pub) == 403, "o /publicar de outra origem: 403")
ok(pedido("POST", "/maisim/scope/publicar", ["Content-Type: application/json", "Sec-Fetch-Site: cross-site"], pub) == 403, "o /publicar de outro site: 403")
ok(pedido("POST", "/maisim/scope/publicar", ["Content-Type: application/json"], pub) == 200 and
   pedido("POST", "/publicar", ["Content-Type: application/json"], pub, host=f"127.0.0.1:{SCOPE}", porta=SCOPE) == 200,
   "a publicação do simu (JSON, sem Origin; pela página e direto no scope): 200")
ok(cru(b"POST /publicar HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n" % (SCOPE, 300 << 20), SCOPE) == 403,
   "o /publicar grande demais (300 MB): 403, sem ler o corpo")
ok(pedido("POST", "/maisim/figuras/figura", [MAU, "X-MaiSim: 1", "Content-Type: application/json"], b"{}") == 403, "a figura com o X-MaiSim, mas de outra origem: 403")
# direto nas portas dos módulos (sem a página): o DNS rebinding também chega lá
ok(pedido("GET", "/maisim/simu/editor/estado", host="site-mau.example:%d" % SIMU, porta=SIMU) == 421
   and pedido("GET", "/maisim/simu/editor/estado", host=f"localhost:{SIMU}", porta=SIMU) == 200, "o simu direto na porta dele: outro Host 421, localhost 200")
ok(pedido("GET", "/maisim/scope/", host="site-mau.example:%d" % SCOPE, porta=SCOPE) == 421
   and pedido("POST", "/publicar", ["Content-Type: application/json"], pub, host="site-mau.example", porta=SCOPE) == 421
   and pedido("GET", "/maisim/scope/", host=f"127.0.0.1:{SCOPE}", porta=SCOPE) == 200, "o scope direto na porta dele: outro Host 421 (GET e POST), 127.0.0.1 200")
# o sinal de vida (um sinal falso de outro site seguraria o MaiSim ligado)
ok(pedido("GET", "/maisim/vivo?id=seguranca_api&fechou=1", [MAU]) == 403 and pedido("GET", "/maisim/vivo?id=seguranca_api&fechou=1", ["Sec-Fetch-Site: cross-site"]) == 403
   and pedido("GET", "/maisim/vivo?id=seguranca_api&fechou=1", ["Sec-Fetch-Site: same-origin"]) == 200, "o sinal de vida de outro site: 403; da página: 200")
# o cabeçalho que não termina
s = socket.create_connection(("127.0.0.1", PAG), timeout=4)
s.sendall(f"GET / HTTP/1.1\r\nHost: localhost:{PAG}\r\n".encode())
t0, fechou = time.time(), False
while not fechou and time.time() - t0 < 30:          # um pedaço a cada 4 s (antes, cada pedaço renovava o prazo: para sempre)
    try:
        fechou = s.recv(10) == b""
    except socket.timeout:
        try:
            s.sendall(b"X-Devagar: 1\r\n")
        except OSError:
            fechou = True
    except ConnectionResetError:
        fechou = True
ok(fechou and 12 < time.time() - t0 < 20, f"o cabeçalho que não termina, um pedaço a cada 4 s: a conexão cai em {time.time() - t0:.0f} s (o prazo é 15 s)")
s.close()
# o motor (o protocolo de linhas): um POST "no-cors" de um site chegava à porta dele e as linhas do corpo viravam comandos.
# O motor de uso fica com o simu (uma conexão por vez): um motor só deste teste, compilado do código de agora, numa porta
# livre, ligado ao Gecko de teste (o Gecko aceita mais um cliente sem soltar o primeiro)
JAR = Path(os.environ.get("MAISIM_GECKO_JAR") or R / "gecko" / "build" / "gecko-lote.jar")
if shutil.which("javac") and shutil.which("java") and JAR.is_file():
    T, m = Path(tempfile.mkdtemp(prefix="maisim-motor-")), None
    def motor(dados):
        """Manda ao motor deste teste e devolve o que voltou, até a resposta ao PING ou até ele fechar."""
        with socket.create_connection(("127.0.0.1", pm), timeout=10) as c:
            c.sendall(dados); r = b""
            try:
                while b"PONG" not in r:
                    x = c.recv(4096)
                    if not x:
                        break
                    r += x
            except socket.timeout:
                pass
            return r
    try:
        subprocess.run(["javac", "-nowarn", "-encoding", "UTF-8", "-cp", str(JAR), "-d", str(T), str(R / "simu" / "motor" / "src" / "maisim" / "MaiSimMotor.java")],
                       check=True, capture_output=True, timeout=180)
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0)); pm = s.getsockname()[1]
        m = subprocess.Popen(["java", "-cp", os.pathsep.join([str(JAR), str(T)]), "maisim.MaiSimMotor", "--gecko-port", str(GECKO), "--porta", str(pm)],
                             stdout=open(T / "motor.log", "w"), stderr=subprocess.STDOUT)
        for _ in range(120):
            try:
                socket.create_connection(("127.0.0.1", pm), timeout=1).close(); break
            except OSError:
                if m.poll() is not None:
                    break
                time.sleep(0.25)
        p1 = motor(b"PING\n")
        h = motor(b"POST / HTTP/1.1\r\nHost: localhost:%d\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nPING\n" % pm)
        p2 = motor(b"PING\n")
        ok(p1.startswith(b"OK PONG") and b"OK" not in h and p2.startswith(b"OK PONG"),
           f"o motor: o PING responde ({p1!r}); um pedido HTTP com um comando no corpo cai sem resposta ({h!r}); o motor segue ({p2!r})")
        bi = motor(b"\x16\x03\x01\x00\x05\x01\x00\x00\x01\nPING\n")   # o começo de um TLS (ou um STUN): bytes de controle
        ok(b"OK" not in bi and motor(b"PING\n").startswith(b"OK PONG"), f"o motor: uma 1ª linha com bytes de controle (TLS, STUN) cai sem resposta ({bi!r})")
        muda = socket.create_connection(("127.0.0.1", pm), timeout=15)   # uma conexão que não manda nada (um site segurando a fila)
        t0 = time.time(); depois = motor(b"PING\n"); t1 = time.time() - t0
        try:
            caiu = muda.recv(10) == b""
        except OSError:
            caiu = True
        muda.close()
        ok(caiu and depois.startswith(b"OK PONG") and 3 < t1 < 9, f"o motor: a conexão muda cai em ~5 s e a seguinte é atendida ({t1:.1f} s, {depois!r})")
    except Exception as e:                               # noqa: BLE001
        ok(False, f"o motor deste teste não subiu: {e} {(T / 'motor.log').read_text()[-300:] if (T / 'motor.log').exists() else ''}")
    finally:
        if m:
            m.terminate()
            try:
                m.wait(5)
            except subprocess.TimeoutExpired:
                m.kill(); m.wait(5)
        shutil.rmtree(T, ignore_errors=True)
else:
    print("(sem o javac, o java ou o jar do Gecko: o motor não foi conferido aqui)")
# a tela com senha (se a máquina tem o x11vnc)
if shutil.which("x11vnc") and shutil.which("Xvfb"):
    T = Path(tempfile.mkdtemp(prefix="maisim-vnc-")); senha = T / "vnc.senha"; senha.write_text("abc12345\n"); os.chmod(senha, 0o600)
    with socket.socket() as s:                           # uma porta livre (não uma fixa: outra tela de teste pode estar no ar)
        s.bind(("127.0.0.1", 0)); porta = s.getsockname()[1]
    for n in range(80, 100):                             # uma tela livre (outra de teste pode estar no ar; o -displayfd do Xvfb
        if Path(f"/tmp/.X{n}-lock").exists():            # fica tentando para sempre na WSL, com o /tmp/.X11-unix só de leitura)
            continue
        tela = f":{n}"
        xv = subprocess.Popen(["Xvfb", tela, "-screen", "0", "320x200x24", "-nolisten", "tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        if xv.poll() is None:
            break
    vnc = subprocess.Popen(["x11vnc", "-display", tela, "-rfbport", str(porta), "-localhost", "-passwdfile", str(senha), "-quiet"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           env={k: v for k, v in os.environ.items() if k not in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE")})   # (vistas, mesmo vazias, o x11vnc desiste)
    tipos, c = b"", None
    try:
        for _ in range(40):
            try:
                c = socket.create_connection(("127.0.0.1", porta), timeout=3); break
            except OSError:
                time.sleep(0.25)
        c.settimeout(20)                                 # (o x11vnc aceita antes de terminar de subir)
        versao = c.recv(12); c.sendall(versao); n = c.recv(1); tipos = c.recv(n[0]) if n and n[0] else b""; c.close()
    except Exception as e:                               # noqa: BLE001
        print("  (o x11vnc não respondeu:", e, ")")
    finally:
        for p in (vnc, xv):
            p.terminate()
            try:
                p.wait(5)
            except subprocess.TimeoutExpired:
                p.kill(); p.wait(5)
        shutil.rmtree(T, ignore_errors=True)
    ok(2 in tipos and 1 not in tipos, f"a tela com -passwdfile pede senha (tipos do RFB: {list(tipos)}; 2 = senha, 1 = sem)")
else:
    print("(sem o x11vnc ou o Xvfb nesta máquina: a tela com senha não foi conferida aqui)")
sys.exit(1 if falhas else 0)
