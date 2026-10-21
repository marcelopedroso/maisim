"""O Google Antigravity como IA do PEW: o Antigravity CLI oficial (`agy`, conferido no 1.4.4), com a conta Google da pessoa
(grátis, Google AI Pro ou Ultra: vale o limite do plano dela no Antigravity), numa casa só do PEW (HOME = ~/.agy-pew: o agy
guarda tudo em $HOME/.gemini/…; o ~/.gemini da pessoa não muda). Por ele, os modelos Gemini e os outros que o Antigravity
oferece. Desde ~jun/2026 o Gemini CLI não atende contas pessoais (a recusa que o Marcelo viu em 21/10); o Antigravity atende.

Pedido: `agy -p` em stream-json, com --sandbox (o terminal restrito) e sem os comandos de barra. No modo sem janela, o agy
libera ler e escrever na pasta de trabalho (a da conversa) e nega o resto (terminal, web, fora da pasta: "perguntar" vira
negado sem janela). A conversa do agy tem o id dele (conversation_id), guardado pelo PEW e retomado com --conversation.
Login: o agy interativo num terminal (pty): o PEW escolhe "Google OAuth" no menu, mostra o link e repassa o código que a
página do Google mostra; o agy escreve "Successfully authenticated as <e-mail>" e o PEW guarda só o e-mail."""
import calendar
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from .base import IA
from .login_pty import LoginPorTerminal

ESTADO_AGY = (".gemini", "antigravity-cli")
NEGA = ["command(*)", "unsandboxed(*)", "read_url(*)", "execute_url(*)", "mcp(*)"]
PARADA = re.compile(r'a tool required the "([^"]+)" permission that headless mode cannot prompt for')
REGRA_AGY = ("\n\nNo PEW você NÃO tem terminal, navegador nem acesso a arquivos fora desta pasta: não tente (o pedido para "
             "sem resposta). Leia e edite só os arquivos desta pasta; o PEW testa e simula o código.")


def _quando(iso):
    """2026-10-28T14:25:45Z → "hoje às 11h25", "amanhã às …" ou "28/10 às 11h25" (a hora daqui)."""
    try:
        t = time.localtime(calendar.timegm(time.strptime(str(iso)[:19], "%Y-%m-%dT%H:%M:%S")))
    except (ValueError, OverflowError):
        return ""
    hora, hoje, amanha = f"{t.tm_hour:02d}h{t.tm_min:02d}", time.localtime(), time.localtime(time.time() + 86400)
    if (t.tm_mon, t.tm_mday) == (hoje.tm_mon, hoje.tm_mday):
        return f"hoje às {hora}"
    if (t.tm_mon, t.tm_mday) == (amanha.tm_mon, amanha.tm_mday):
        return f"amanhã às {hora}"
    return f"{t.tm_mday:02d}/{t.tm_mon:02d} às {hora}"


def _sem_links_locais(texto):
    """O agy põe links file:///… para os arquivos que cita ([controle.py](file:///…)): na tela não abrem — fica o nome."""
    return re.sub(r"\[([^\]]+)\]\(file://[^)\s]+\)", r"`\1`", str(texto or "")).replace("``", "`")


def _ferramenta(nome):
    """O nome de uma ferramenta do agy → o do PEW (a linha "lendo controle.py" da tela)."""
    n = str(nome or "").lower()
    if n in ("run_command", "send_command_input"):
        return "terminal (negado)"
    if n in ("search_web", "read_url_content", "open_browser_url"):
        return "web"
    for chave, pew in (("grep", "Grep"), ("list_dir", "Glob"), ("find_by_name", "Glob"), ("glob", "Glob"), ("sed_file", "Edit"),
                       ("replace", "Edit"), ("edit", "Edit"), ("write", "Write"), ("create", "Write"), ("view", "Read"), ("read", "Read")):
        if chave in n:
            return pew
    return nome or "ferramenta"


class Antigravity(LoginPorTerminal, IA):
    id = "antigravity"
    nome = "Google Antigravity"
    variavel_pasta = "HOME"                        # o agy usa $HOME/.gemini/…: a casa do PEW isola a configuração e o login
    esforcos = ("",)                               # o esforço vem no nome do modelo do agy (…-low, …-medium, …-high)
    tem_login = True

    LOGIN_URL = re.compile(r"https://accounts\.google\.com/o/oauth2/auth\?[^\s\x1b\x07]+")
    LOGIN_RESPOSTAS = ((r"Select login method", b"\r"),)      # 1. Google OAuth (o padrão do menu)
    LOGIN_ERROS = re.compile(r"(OAuth token exchange failed[^\r\n]*|invalid_grant[^\r\n]*|Error: authentication[^\r\n]*|"
                             r"authentication failed[^\r\n]*)")

    def __init__(self, binario, pasta):
        super().__init__(binario, pasta)
        self._login_init()
        self._uso, self._trava_uso = None, threading.Lock()

    def _conta(self):
        return self.pasta / "pew" / "conta.json"

    def _token(self):
        # o login do agy (conferido em 21/10 com a conta do Marcelo: um arquivo, sem chaveiro no WSL). O PEW só vê se existe
        return self.pasta.joinpath(*ESTADO_AGY, "antigravity-oauth-token")

    # ---- o login
    def login_argv(self):
        return [self.bin]

    def _prepara(self):
        """As regras de negação do PEW na configuração do agy (só na casa do PEW). Conferido em 21/10 com a conta do Marcelo:
        sem elas, o 1º uso do terminal faz o agy parar o pedido sem resposta; com elas, ele recebe "negado" e segue. Ler e
        escrever fora da pasta o agy já nega sem janela (e para o pedido); o /tmp ele deixa escrever."""
        arq = self.pasta.joinpath(*ESTADO_AGY, "settings.json")
        try:
            atual = json.loads(arq.read_text())
            if not isinstance(atual, dict):
                atual = {}
        except (OSError, ValueError):
            atual = {}
        perm = atual.get("permissions") if isinstance(atual.get("permissions"), dict) else {}
        nega = list(dict.fromkeys([*(perm.get("deny") or []), *NEGA]))
        novo = {**atual, "permissions": {**perm, "deny": nega}}
        if novo != atual:
            arq.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            tmp = arq.with_name(f".{arq.name}.pew")
            tmp.write_text(json.dumps(novo, ensure_ascii=False, indent=2) + "\n")
            os.chmod(tmp, 0o600)
            os.replace(tmp, arq)

    def _prepara_login(self):
        super()._prepara_login()
        self._prepara()
        self._ok_desde = None

    # ---- os modelos da conta (agy models), guardados pelo PEW; a lista muda com o plano e com o tempo
    def _modelos_arq(self):
        return self.pasta / "pew" / "modelos.json"

    def atualiza_modelos(self):
        try:
            r = subprocess.run([self.bin, "models"], env=self.ambiente(), capture_output=True, text=True, timeout=90,
                               stdin=subprocess.DEVNULL, cwd=str(self.pasta))
        except (subprocess.SubprocessError, OSError):
            return
        lista = [ln.split("\t", 1) for ln in r.stdout.splitlines() if re.fullmatch(r"[a-z0-9][a-z0-9.\-]+\t.+", ln.strip())]
        if lista:
            self._modelos_arq().parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            self._modelos_arq().write_text(json.dumps([[m.strip(), n.strip()] for m, n in lista], ensure_ascii=False) + "\n")

    # ---- os limites da conta: `agy -p "/usage"` (0 tokens: o comando do agy, sem o modelo), os grupos de modelos com o
    # limite semanal e o de 5 h, e quando renovam (o mesmo da tela do Antigravity). Guardado por 60 s
    GRUPOS = {"Gemini Models": "Gemini", "Claude and GPT models": "Claude e GPT"}
    JANELAS = {"weekly": "semana", "5h": "5 h"}

    def uso(self, forca=False):
        with self._trava_uso:
            if not forca and self._uso and time.time() - self._uso["quando"] < 60:
                return self._uso
            vazio = self.pasta / "pew" / "uso"
            vazio.mkdir(mode=0o700, parents=True, exist_ok=True)
            try:
                r = subprocess.run([self.bin, "-p", "/usage", "--output-format", "json"], env=self.ambiente(), cwd=str(vazio),
                                   capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
                grupos = ((json.loads(r.stdout or "{}").get("command") or {}).get("data") or {}).get("groups") or []
                itens = []
                for g in grupos:
                    nome = self.GRUPOS.get(g.get("name"), g.get("name") or "?")
                    for b in g.get("buckets") or []:
                        janela = self.JANELAS.get(b.get("window"), b.get("window") or "")
                        itens.append({"rotulo": f"{nome} · {janela}", "pct": round((1 - float(b.get("remaining_fraction") or 0)) * 100, 1),
                                      "renova": _quando(b.get("reset_time")), "grupo": g.get("description") or ""})
                v = {"itens": itens, "quando": time.time()}
                if not itens:
                    v["erro"] = (r.stderr.strip().splitlines() or [f"saída {r.returncode}"])[-1][:200]
            except (subprocess.SubprocessError, OSError, ValueError, TypeError) as e:
                v = {"itens": [], "quando": time.time(), "erro": f"não consegui ler os limites: {e}"}
            self._uso = v
            return v

    def ao_iniciar(self):
        if self.logado() and not self._modelos_arq().exists():
            self.atualiza_modelos()

    @property
    def modelos(self):
        try:
            return ("", *[m for m, _ in json.loads(self._modelos_arq().read_text())])
        except (OSError, ValueError, TypeError):
            return ("",)

    def rotulos(self):
        try:
            return {m: n for m, n in json.loads(self._modelos_arq().read_text())}
        except (OSError, ValueError, TypeError):
            return {}

    def login_terminou(self, texto):
        # o login acabou quando o agy grava o arquivo dele: a página do Antigravity devolve o código sozinha (o Marcelo, em
        # 21/10, autorizou e entrou sem colar nada) e o agy não escreve "Successfully authenticated" no terminal nesse caso
        m = re.search(r"Successfully authenticated as ([^\s]+?)\.?(?:\s|$)", texto)
        if m:
            return (True, m.group(1))
        if not self._token().exists():
            return None
        self._ok_desde = getattr(self, "_ok_desde", None) or time.time()
        email = self.email_do_log()                          # o agy escreve a conta no log dele logo depois de entrar
        if email or time.time() - self._ok_desde > 6:
            return (True, email)
        return None

    def ao_entrar(self, conta):
        self._conta().parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._conta().write_text(json.dumps({"email": conta, "quando": time.time()}) + "\n")
        self.atualiza_modelos()

    def logado(self):
        return self._token().exists()

    def email_do_log(self):
        """A conta que o agy escreve no log dele a cada vez que roda ("OAuth: authenticated successfully as <e-mail>"; achado
        em 21/10). É o log, não a credencial: o PEW lê o mais novo que tiver a linha."""
        pasta = self.pasta.joinpath(*ESTADO_AGY, "log")
        try:
            logs = sorted(pasta.glob("cli-*.log"), reverse=True)[:8]
        except OSError:
            return None
        for f in logs:
            try:
                with open(f, "rb") as arq:
                    achado = None
                    for linha in arq:
                        if b"authenticated successfully as" in linha:
                            m = re.search(rb"authenticated successfully as ([^\s@]+@[^\s]+?)\.?\s*$", linha)
                            achado = m.group(1).decode(errors="replace") if m else achado
            except OSError:
                continue
            if achado:
                return achado
        return None

    def estado(self):
        logado = self.logado()
        email = None
        if logado:
            try:
                email = json.loads(self._conta().read_text()).get("email")
            except (OSError, ValueError, AttributeError):
                pass
            email = self.email_do_log() or email
        return {"id": self.id, "nome": self.nome, "instalado": self.instalado(), "logado": logado, "email": email,
                "metodo": "conta Google, pelo Antigravity", "pasta": str(self.pasta).replace(str(Path.home()), "~", 1),
                "login": self.login_estado()}

    def sai(self):
        self.cancela()
        self._conta().unlink(missing_ok=True)
        self._token().unlink(missing_ok=True)            # o arquivo do login do agy (apaga, não lê)
        with self._trava:
            self._login.clear()
        return self.estado()

    def erro_conhecido(self, texto):
        m = PARADA.search(texto or "")
        if m:
            o_que = {"command": "o terminal", "read_file": "ler um arquivo fora da pasta", "write_file": "escrever fora da pasta",
                     "read_url": "abrir uma página da web", "execute_url": "o navegador", "mcp": "uma ferramenta externa"}.get(m.group(1), m.group(1))
            return (f"o {self.nome} tentou {o_que}, que o PEW não deixa, e parou sem responder. Peça de novo; se precisar, diga "
                    "para ele usar só os arquivos desta pasta.")
        if re.search(r"not logged in|no stored credentials|Authentication required|authentication failed or timed out", texto or "", re.I):
            self._conta().unlink(missing_ok=True)       # o agy não aceitou o login guardado: a tela pede para entrar de novo
            self._token().unlink(missing_ok=True)
            return f"o {self.nome} não está com o login (o agy pediu para entrar de novo): entre de novo pelo balão da IA"
        return None

    # ---- o pedido e o resumo
    def sessao_existe(self, sid):
        # o id é o do agy (o PEW guarda o conversation_id da 1ª resposta); antes disso, o sorteado pelo PEW não existe lá
        return bool(sid) and any(self.pasta.joinpath(*ESTADO_AGY, "conversations").glob(f"{sid}*"))

    def comando(self, prompt, sessao, retoma, regras, modelo="", esforco="", passos=100, editaveis=(), pasta=None):
        self._prepara()
        texto = prompt if retoma else f"{regras}{REGRA_AGY}\n\n---\n\n{prompt}"   # as regras do PEW no começo da conversa
        return [self.bin, "-p", texto, "--output-format", "stream-json", "--sandbox", "--disable-slash-commands",
                *(["--model", modelo] if modelo else []), *(["--effort", esforco] if esforco else []),
                *(["--conversation", sessao] if retoma else [])]

    def comando_resumo(self, prompt, modelo="", esforco="", pasta=None):
        self._prepara()
        return [self.bin, "-p", prompt, "--output-format", "json", "--sandbox", "--disable-slash-commands",
                *(["--model", modelo] if modelo else [])]

    def traduz(self, ev, estado=None):
        st = estado if estado is not None else {}
        t, out = ev.get("event") or ev.get("type"), []
        d = ev.get(t) if isinstance(ev.get(t), dict) else ev      # o agy 1.4.4 aninha: {"event": "x", "x": {...}}
        if ev.get("conversation_id") or d.get("conversation_id"):
            st["sessao"] = ev.get("conversation_id") or d.get("conversation_id")
        if t == "init":
            st["modelo"] = d.get("model") or st.get("modelo_pedido")
            out.append({"tipo": "inicio", "modelo": st["modelo"]})
        elif t == "step_update":
            if d.get("step_type") == "agent_response" and d.get("text_delta"):
                passo = d.get("step_index")
                if st.get("passo_texto") != passo:            # cada resposta do agente é um bloco de texto
                    st["passo_texto"] = passo
                    st["blocos"] = st.get("blocos", []) + [""]
                st["blocos"][-1] += str(d["text_delta"])
                if d.get("state") == "DONE" and st["blocos"][-1].strip():
                    out.append({"tipo": "texto", "texto": _sem_links_locais(st["blocos"][-1].strip())})
            nome, passo = d.get("tool_name"), d.get("step_index")
            if nome and passo not in st.setdefault("passos", set()):
                st["passos"].add(passo)
                par = (d.get("tool_info") or {}).get("parameters") or {} if isinstance(d.get("tool_info"), dict) else {}
                arq = next((par[k] for k in ("Path", "AbsolutePath", "TargetFile", "FilePath", "path", "file_path") if par.get(k)), "")
                ent = {"file_path": arq, "pattern": par.get("Query") or par.get("Pattern") or par.get("query") or ""}
                out.append({"tipo": "ferramenta", "nome": _ferramenta(nome), "entrada": ent})
        elif t == "result":
            out.append(self._resultado(d, st))
        return out

    def _resultado(self, r, st):
        uso = r.get("usage") or {}
        erro = str(r.get("status") or "").upper() != "SUCCESS"
        texto = (r.get("error") or r.get("status")) if erro else (_sem_links_locais((r.get("response") or "").strip()) or None)
        return {"tipo": "resultado", "erro": erro, "texto": texto, "erros": [], "subtipo": r.get("status"), "limite_passos": False,
                "uso": {"entrada": int(uso.get("input_tokens") or 0) + int(uso.get("cache_read_tokens") or 0),
                        "saida": int(uso.get("output_tokens") or 0) + int(uso.get("thinking_tokens") or 0)},
                "turnos": r.get("num_turns"), "ms": int(float(r.get("duration_seconds") or 0) * 1000), "custo": None, "negados": [],
                "modelo": st.get("modelo") or None, "sessao": r.get("conversation_id") or st.get("sessao")}

    def le_resultado_json(self, ev):
        if not isinstance(ev, dict) or not ev:
            return None
        r = ev.get("result") if isinstance(ev.get("result"), dict) else ev
        return self._resultado(r, {})
