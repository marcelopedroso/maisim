"""O Cursor como IA do MaiSim: o Cursor CLI oficial (`agent`, conferido no 2026.10.22-27dcf5f em 25/10, sem conta: o --help, o
`agent status` deslogado, o `agent login` até o link, e a documentação de headless, output-format, permissions e
configuration em cursor.com/docs/cli). O MaiSim só chama o próprio `agent` (nunca a API privada dele): o Cursor diz no
fórum oficial que rodar o CLI por script na própria máquina é uso previsto, e o que os termos proíbem são os clientes não
oficiais que falam com os endpoints privados.

A casa do MaiSim (MAISIM_CURSOR_DIR, ~/.cursor-maisim; no Windows instalado, %APPDATA%\\MaiSim\\cursor) é a HOME do `agent`
(no Windows, USERPROFILE e APPDATA), com CURSOR_CONFIG_DIR e CURSOR_DATA_DIR dentro dela: a configuração, as conversas e o
login do Cursor do MaiSim ficam ali, e o ~/.cursor e o ~/.config/cursor da pessoa não mudam.

Pedido: `agent -p --output-format stream-json --trust --sandbox disabled`, SEM --force (o --force deixa escrever em qualquer
lugar que não esteja negado). A política vai na configuração da casa (cli-config.json) e na da pasta da conversa
(.cursor/cli.json): o modo "allowlist", só ler dentro da pasta (sandbox.readBoundary "workspace"), escrever só nos arquivos
editáveis e nos .py da pasta, e negados o terminal (Shell), a web, o MCP, a casa do MaiSim (o login e a chave) e os
arquivos que o MaiSim escreve para a IA ler. O caminho de cada regra é o absoluto (o `agent` compara o caminho resolvido).
As regras do MaiSim vão no AGENTS.md da pasta (o `agent` o lê como regra do projeto). Sem a casa própria ou sem a política
gravada, `comando` levanta ValueError e o pedido é recusado: não se roda sem as travas.

A conversa do `agent` tem o id dele (session_id do init/result), guardado pelo MaiSim e retomado com --resume.
Login: `agent login` (o link da página do Cursor; o `agent` confere sozinho, sem código para colar), ou a chave de API do
Cursor (CURSOR_API_KEY, a autenticação documentada para scripts e CI), colada na janela das contas e guardada num arquivo
0600 na casa; nunca volta para a página nem vai para um registro. MAISIM_CURSOR_ENTRADA ("login,chave" ou "chave,login")
diz qual vem primeiro: a que a tela oferece antes e a que vale quando as duas existem."""
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

from .base import IA, ComChave, acha_unix, instalador_unix
import lingua  # noqa: E402                    as mensagens no idioma do pedido (o config/ entra no sys.path pelo base)
import processos  # noqa: E402                 o grupo do `agent` (Linux e Windows) e o encerra

WIN = os.name == "nt"
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")
URL_LOGIN = re.compile(r"https://cursor\.com/[^\s\x1b\x07\"'<>]+")
ENTROU = re.compile(r"Logged in as ([^\s]+?)\.?\s*$", re.M)
SEM_LOGIN = re.compile(r"Authentication required|Not logged in|Your stored authentication is invalid|Please log in again", re.I)
CHAVE_RUIM = re.compile(r"invalid api key|api key (?:is )?(?:invalid|not valid|revoked|expired)", re.I)   # conferido: "The provided API key is invalid."
MODELO_RUIM = re.compile(r"Cannot use this model: ([^\s.]+)")
LIMITE = re.compile(r"usage limit|rate limit|quota exceeded|out of (?:requests|credits)", re.I)
CONFIANCA = re.compile(r"Workspace Trust Required")
VERSAO = re.compile(r"^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d{2})-(\d{2})-(\d{2}))?-[a-f0-9]+$")   # a pasta de uma versão (o agent.ps1)
LOGIN_PRAZO = 5 * 60                                     # o login espera a página do Cursor por até 5 min
# os arquivos que o MaiSim escreve na pasta da conversa só para a IA ler (as regras negam escrever neles)
SO_LEITURA = ("CONTEXTO.md", "CONVERSA.md", "GUIA_CONTROLE.md", "ULTIMA_RODADA.md", "AGENTS.md", "CLAUDE.md")


def acha_cursor():
    """O `agent`: MAISIM_CURSOR_BIN (testes); no Linux, o cursor-agent do PATH ou o do instalador oficial
    (~/.local/bin/cursor-agent: o mesmo do `agent`, com um nome que outro programa não usa); no Windows, o lançador do
    instalador (%LOCALAPPDATA%\\cursor-agent\\cursor-agent.cmd), procurado pelo caminho (o instalador o põe só no PATH novo)
    — o pedido não passa por ele (ver Cursor.argv)."""
    if os.environ.get("MAISIM_CURSOR_BIN"):
        return os.environ["MAISIM_CURSOR_BIN"]
    if WIN:
        local = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        return str(local / "cursor-agent" / "cursor-agent.cmd")
    return acha_unix("cursor-agent")


def _versao_mais_nova(raiz):
    """A pasta da versão mais nova em <raiz>/versions (como o agent.ps1 escolhe), ou None."""
    achadas = []
    try:
        for d in (Path(raiz) / "versions").iterdir():
            m = VERSAO.match(d.name)
            if m and d.is_dir() and (d / "node.exe").exists() and (d / "index.js").exists():
                achadas.append((tuple(int(x or 0) for x in m.groups()), d))
    except OSError:
        return None
    return max(achadas)[1] if achadas else None


def _operando(prompt):
    """O pedido como o último argumento: um pedido que comece com "-" viraria uma opção do `agent`."""
    return " " + prompt if str(prompt).startswith("-") else prompt


def _ferramenta(tipo):
    """O tipo de uma chamada do `agent` (readToolCall, editToolCall…) → o nome que a tela do MaiSim conhece."""
    nomes = {"readToolCall": "Read", "editToolCall": "Edit", "writeToolCall": "Write",
             "globToolCall": "Glob", "lsToolCall": "Glob", "grepToolCall": "Grep", "semSearchToolCall": "Grep"}
    if tipo in nomes:
        return nomes[tipo]
    if tipo == "deleteToolCall":
        return lingua.tr("ia_cursor.ferramenta_apagar")
    if tipo in ("shellToolCall", "writeShellStdinToolCall"):
        return lingua.tr("ia_cursor.ferramenta_terminal")
    if tipo in ("webFetchToolCall", "webSearchToolCall", "fetchToolCall"):
        return "web"
    return re.sub(r"ToolCall$", "", str(tipo or "")) or lingua.tr("ia_cursor.ferramenta")


def _recusa(res):
    """O resultado de uma chamada que o `agent` não deixou fazer (rejected, permissionDenied…): o motivo, ou None."""
    if not isinstance(res, dict):
        return None
    for k, v in res.items():
        if k == "rejected" or k.endswith("PermissionDenied") or k == "permissionDenied":
            v = v if isinstance(v, dict) else {}
            return str(v.get("reason") or v.get("error") or v.get("path") or v.get("command") or k)
    return None


class Cursor(ComChave, IA):
    id = "cursor"
    nome = "Cursor"
    painel_uso = "https://cursor.com/dashboard"     # o CLI não informa o uso: a tela aponta para o painel da conta
    variavel_pasta = "HOME"                      # o ambiente() troca também USERPROFILE/APPDATA (Windows) e as do Cursor
    esforcos = ("",)                             # o esforço vem no nome do modelo do Cursor (…[effort=high])
    tem_login = True
    forma_chave = re.compile(r"[A-Za-z0-9_.\-]{20,400}")   # a chave colada (ComChave: o arquivo <pasta>/maisim/chave, 0600, mascarada)

    def __init__(self, binario, pasta):
        super().__init__(binario, pasta)
        self._login, self._trava = {}, threading.Lock()

    # ---- os arquivos da casa (o MaiSim só vê se existem; o login quem grava é o `agent`)
    def _maisim(self):
        return self.pasta / "maisim"

    def _conta(self):
        return self._maisim() / "conta.json"

    def _modelos_arq(self):
        return self._maisim() / "modelos.json"

    def _config_dir(self):
        return self.pasta / ".cursor"

    def _token(self):
        """O arquivo do login do `agent` na casa (Linux: $XDG_CONFIG_HOME/cursor/auth.json; Windows: %APPDATA%\\Cursor\\auth.json).
        O MaiSim só confere se existe; nunca o lê."""
        if WIN:
            return self.pasta / "AppData" / "Roaming" / "Cursor" / "auth.json"
        return self.pasta / ".config" / "cursor" / "auth.json"

    def ordem(self):
        """A ordem das entradas (MAISIM_CURSOR_ENTRADA: "login,chave" ou "chave,login"): a 1ª é a que a tela oferece antes e a
        que vale quando as duas existem."""
        v = [x.strip() for x in str(os.environ.get("MAISIM_CURSOR_ENTRADA") or "").split(",") if x.strip() in ("login", "chave")]
        return tuple(dict.fromkeys(v + ["login", "chave"]))

    @property
    def modo_login(self):
        return "chave" if self.ordem()[0] == "chave" else ""

    # ---- a chave de API (CURSOR_API_KEY, guardada pela ComChave): só no ambiente do processo do Cursor
    def _usa_chave(self):
        """A chave vale neste pedido? (há chave e ela vem antes do login, ou não há login)"""
        k = self.le_chave()
        return k if k and (self.ordem()[0] == "chave" or not self._token().exists()) else None

    def ambiente(self, **extra):
        casa = str(self.pasta)
        env = super().ambiente(**extra)
        env.update(HOME=casa, CURSOR_CONFIG_DIR=str(self._config_dir()), CURSOR_DATA_DIR=str(self._config_dir()),
                   XDG_CONFIG_HOME=str(self.pasta / ".config"), XDG_CACHE_HOME=str(self.pasta / ".cache"),
                   XDG_DATA_HOME=str(self.pasta / ".local" / "share"), NO_OPEN_BROWSER="1", CURSOR_INVOKED_AS="agent")
        if WIN:
            env.update(USERPROFILE=casa, APPDATA=str(self.pasta / "AppData" / "Roaming"), LOCALAPPDATA=str(self.pasta / "AppData" / "Local"))
            env.pop("HOMEDRIVE", None)
            env.pop("HOMEPATH", None)
        elif sys.platform == "darwin":
            env["AGENT_CLI_CREDENTIAL_STORE"] = "file"     # no macOS o padrão é o chaveiro (o mesmo do Cursor da pessoa)
        k = self._usa_chave()
        if k:
            env["CURSOR_API_KEY"] = k
        return env

    def argv(self):
        """O começo do comando. No Windows, o node.exe e o index.js da versão mais nova direto: o agent.cmd passaria o pedido
        pelo cmd.exe e pelo PowerShell, que leem & | < > " e as quebras de linha (o pedido não chegaria inteiro)."""
        if WIN and not os.environ.get("MAISIM_CURSOR_BIN"):
            v = _versao_mais_nova(Path(self.bin).parent)
            if v is None:
                raise ValueError(lingua.tr("ia_cursor.sem_versao", pasta=str(Path(self.bin).parent / "versions")))
            return [str(v / "node.exe"), str(v / "index.js")]
        return [self.bin]

    def comando_instala(self):
        """O instalador oficial do Cursor CLI (o botão Instalar da janela das contas): no Windows, o do PowerShell (sem
        administrador, em %LOCALAPPDATA%\\cursor-agent); fora dele, None (a tela mostra o comando para o terminal,
        `curl https://cursor.com/install -fsS | bash`). MAISIM_INSTALA_CURSOR_CMD (testes) troca por outro comando."""
        teste = os.environ.get("MAISIM_INSTALA_CURSOR_CMD")
        if teste:
            return shlex.split(teste)
        if not WIN:                                   # Linux/macOS: o instalador oficial, com a casa na pasta do MaiSim
            return instalador_unix("curl https://cursor.com/install -fsS | bash")
        ps = Path(os.environ.get("SYSTEMROOT") or r"C:\Windows") / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        return [str(ps) if ps.exists() else "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                "$ProgressPreference='SilentlyContinue'; irm 'https://cursor.com/install?win32=true' | iex"]

    # ---- as travas: a casa própria e a política (a do MaiSim por cima do que o `agent` tiver gravado)
    def _confere_casa(self):
        """A casa existe, é só do MaiSim (nunca a pasta pessoal nem o ~/.cursor da pessoa) e dá para escrever nela."""
        casa = self.pasta.resolve()
        pessoal = Path.home().resolve()
        if casa in (pessoal, pessoal / ".cursor", pessoal / ".config" / "cursor") or casa in pessoal.parents:
            raise ValueError(lingua.tr("ia_cursor.sem_isolamento", nome=self.nome, erro=str(casa)))
        try:
            for d in (self._maisim(), self._config_dir(), self.pasta / ".config"):
                d.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(self.pasta, 0o700)
        except OSError as e:
            raise ValueError(lingua.tr("ia_cursor.sem_isolamento", nome=self.nome, erro=e.strerror or type(e).__name__))

    @staticmethod
    def _grava_json(arq, dados):
        arq.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        tmp = arq.with_name(f".{arq.name}.tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, arq)

    def politica(self, pasta, editaveis=(), escreve=True):
        """As regras do Cursor para uma pasta de trabalho (os caminhos absolutos dela): {"allow", "deny"}."""
        p, casa = str(Path(pasta).resolve()), str(self.pasta.resolve())
        sep = "\\" if WIN else "/"
        permite = ([f"Write({p}{sep}{f})" for f in editaveis] + [f"Write({p}{sep}*.py)"]) if escreve else []
        nega = ["Shell(*)", "WebFetch(*)", "Mcp(*:*)", f"Read({casa}{sep}*)", f"Write({casa}{sep}*)",
                *[f"Write({p}{sep}{f})" for f in SO_LEITURA], f"Write({p}{sep}*{sep}*)"]   # as subpastas (anexos, contextos…)
        if not escreve:
            nega.append(f"Write({p}{sep}*)")
        return {"allow": [f"Read({p}{sep}*)", *permite], "deny": nega}

    def _prepara(self, pasta, editaveis=(), regras=None, escreve=True):
        """Grava a política (na configuração da casa e, num pedido, também na da pasta: .cursor/cli.json) e as regras do MaiSim
        (AGENTS.md); confere o que gravou. Qualquer falha: ValueError (o pedido não roda). O resumo (escreve=False) roda na
        pasta de um contexto salvo, que é da pessoa (a lista de arquivos e a exportação dele): lá só a configuração da casa."""
        self._confere_casa()
        pol = self.politica(pasta, editaveis, escreve)
        arq = self._config_dir() / "cli-config.json"
        try:
            atual = json.loads(arq.read_text())
            if not isinstance(atual, dict):
                atual = {}
        except (OSError, ValueError):
            atual = {}
        sandbox = atual.get("sandbox") if isinstance(atual.get("sandbox"), dict) else {}
        novo = {**atual, "version": 1, "editor": atual.get("editor") if isinstance(atual.get("editor"), dict) else {"vimMode": False},
                "permissions": pol, "approvalMode": "allowlist", "autoAcceptWebSearch": False,
                "sandbox": {**sandbox, "mode": "disabled", "readBoundary": "workspace", "networkAccess": "user_config_only"}}
        try:
            self._grava_json(arq, novo)
            if escreve:
                self._grava_json(Path(pasta) / ".cursor" / "cli.json", {"permissions": pol})
            if regras is not None:
                (Path(pasta) / "AGENTS.md").write_text(regras)
            lido = json.loads(arq.read_text())
            lido_p = json.loads((Path(pasta) / ".cursor" / "cli.json").read_text()) if escreve else {"permissions": pol}
        except (OSError, ValueError) as e:
            raise ValueError(lingua.tr("ia_cursor.sem_politica", nome=self.nome, erro=getattr(e, "strerror", None) or type(e).__name__))
        if lido.get("permissions") != pol or lido.get("approvalMode") != "allowlist" or lido_p.get("permissions") != pol:
            raise ValueError(lingua.tr("ia_cursor.sem_politica", nome=self.nome, erro="cli-config.json"))

    # ---- o pedido e o resumo
    def comando(self, prompt, sessao, retoma, regras, modelo="", esforco="", passos=100, editaveis=(), pasta=None):
        if pasta is None:
            raise ValueError(lingua.tr("ia_cursor.sem_politica", nome=self.nome, erro="cwd"))
        self._prepara(pasta, editaveis, regras)
        # sem --force: o modo "allowlist" da configuração; --trust: a pasta da conversa é do MaiSim (sem ele, o `agent` sem
        # janela para em "Workspace Trust Required"); --disable-auto-update: a atualização do `agent` iria para a casa do
        # MaiSim (a HOME dele), uma 2ª cópia do CLI
        return [*self.argv(), "-p", "--output-format", "stream-json", "--trust", "--sandbox", "disabled", "--disable-auto-update",
                "--workspace", str(Path(pasta).resolve()), *(["--model", modelo] if modelo else []),
                *(["--resume", sessao] if retoma else []), _operando(prompt)]

    def comando_resumo(self, prompt, modelo="", esforco="", pasta=None):
        if pasta is None:
            raise ValueError(lingua.tr("ia_cursor.sem_politica", nome=self.nome, erro="cwd"))
        self._prepara(pasta, escreve=False)               # só ler: nenhuma escrita permitida, e o modo "ask" (só leitura)
        return [*self.argv(), "-p", "--output-format", "json", "--mode", "ask", "--trust", "--sandbox", "disabled",
                "--disable-auto-update", "--workspace", str(Path(pasta).resolve()), *(["--model", modelo] if modelo else []),
                _operando(prompt)]

    def sessao_existe(self, sid):
        # o id é o do `agent` (o session_id da 1ª resposta); antes disso, o sorteado pelo MaiSim não existe lá
        return bool(sid) and any((self._config_dir() / "chats").glob(f"*/{sid}/store.db"))

    def traduz(self, ev, estado=None):
        st = estado if estado is not None else {}
        t, out = ev.get("type"), []
        if ev.get("session_id"):
            st["sessao"] = ev["session_id"]
        if t == "system" and ev.get("subtype") == "init":
            st["modelo"] = ev.get("model")
            out.append({"tipo": "inicio", "modelo": st["modelo"]})
        elif t == "assistant":
            # sem --stream-partial-output (o MaiSim não pede), cada evento é uma mensagem inteira (a de antes de uma
            # ferramenta e a do fim): todas valem
            texto = "".join(b.get("text", "") for b in (ev.get("message") or {}).get("content") or [] if isinstance(b, dict) and b.get("type") == "text")
            if texto.strip():
                st.setdefault("textos", []).append(texto.strip())
                out.append({"tipo": "texto", "texto": texto.strip()})
        elif t == "tool_call":
            chamada = ev.get("tool_call") if isinstance(ev.get("tool_call"), dict) else {}
            tipo = next((k for k in chamada if k.endswith("ToolCall")), None)
            if tipo is None and isinstance(chamada.get("function"), dict):
                tipo = chamada["function"].get("name")
            corpo = chamada.get(tipo) if isinstance(chamada.get(tipo), dict) else {}
            args = corpo.get("args") if isinstance(corpo.get("args"), dict) else {}
            if ev.get("subtype") == "started":
                st["chamadas"] = st.get("chamadas", 0) + 1
                ent = {"file_path": args.get("path") or args.get("targetDirectory") or "",
                       "pattern": args.get("pattern") or args.get("globPattern") or args.get("command") or ""}
                out.append({"tipo": "ferramenta", "nome": _ferramenta(tipo), "entrada": ent})
            elif ev.get("subtype") == "completed":
                motivo = _recusa(corpo.get("result"))
                if motivo is not None:
                    nome = _ferramenta(tipo)
                    st.setdefault("negados", []).append({"nome": nome, "entrada": args})
                    out.append({"tipo": "recusa", "msg": lingua.tr("ia_cursor.negado", o_que=nome, motivo=motivo[:200])})
        elif t == "result":
            out.append(self._resultado(ev, st))
        return out

    def _resultado(self, r, st):
        uso = r.get("usage") if isinstance(r.get("usage"), dict) else {}
        erro = bool(r.get("is_error")) or (r.get("subtype") not in (None, "success"))
        # o `result` do Cursor cola as mensagens sem separar ("…o PI.Sim — …"): o texto é o das mensagens, um parágrafo cada
        texto = ("\n\n".join(st.get("textos") or []) if not r.get("is_error") and st.get("textos") else str(r.get("result") or "").strip()) or None
        return {"tipo": "resultado", "erro": erro, "texto": texto, "erros": [], "subtipo": r.get("subtype"), "limite_passos": False,
                "uso": {"entrada": sum(int(uso.get(k) or 0) for k in ("inputTokens", "cacheReadTokens", "cacheWriteTokens")),
                        "saida": int(uso.get("outputTokens") or 0)},
                "turnos": st.get("chamadas"), "ms": r.get("duration_ms"), "custo": None, "negados": list(st.get("negados") or []),
                "modelo": st.get("modelo") or None, "sessao": r.get("session_id") or st.get("sessao")}

    def le_resultado_json(self, ev):
        if not isinstance(ev, dict) or ev.get("type") != "result":
            return None
        return self._resultado(ev, {})

    def erro_conhecido(self, texto):
        texto = ANSI.sub("", texto or "")
        if CHAVE_RUIM.search(texto) or (SEM_LOGIN.search(texto) and self._usa_chave()):
            return lingua.tr("ia_cursor.chave_recusada", nome=self.nome)     # a chave fica: a pessoa a troca na janela das contas
        if SEM_LOGIN.search(texto):
            self._conta().unlink(missing_ok=True)          # o `agent` não aceitou o login guardado: a tela pede para entrar de novo
            return lingua.tr("ia_cursor.sem_login", nome=self.nome)
        m = MODELO_RUIM.search(texto)
        if m:
            lingua.thread(self.atualiza_modelos).start()   # a lista da conta mudou: a tela recebe a nova
            return lingua.tr("ia_cursor.modelo_indisponivel", nome=self.nome, modelo=m.group(1))
        if CONFIANCA.search(texto):
            return lingua.tr("ia_cursor.confianca", nome=self.nome)
        if LIMITE.search(texto):
            return lingua.tr("ia_cursor.limite", nome=self.nome)
        return None

    # ---- os modelos da conta (`agent models`), guardados pelo MaiSim; a lista muda com o plano e com o tempo
    @staticmethod
    def le_modelos(saida):
        """As linhas "<id> - <nome> (current, default)" do `agent models` → [[id, nome]]."""
        lista = []
        for ln in ANSI.sub("", saida or "").splitlines():
            m = re.fullmatch(r"\s*([A-Za-z0-9][\w.\-\[\]=,:]*)\s+-\s+(.+?)(?:\s+\((?:current|default)(?:,\s*(?:current|default))?\))?\s*", ln)
            if m:
                lista.append([m.group(1), m.group(2).strip()])
        return lista

    def atualiza_modelos(self, chave=None):
        """Lê a lista da conta; chave: a de um teste (a chave colada, antes de guardar). Devolve (código de saída, saída de erro)."""
        env = self.ambiente()
        if chave:
            env["CURSOR_API_KEY"] = chave
        try:
            r = subprocess.run([*self.argv(), "models"], env=env, capture_output=True, text=True, timeout=90,
                               stdin=subprocess.DEVNULL, cwd=str(self.pasta))
        except (subprocess.SubprocessError, OSError, ValueError) as e:
            return None, str(e)
        lista = self.le_modelos(r.stdout)
        if r.returncode == 0 and lista:
            self._grava_json(self._modelos_arq(), lista)
        return r.returncode, r.stderr or ""

    def ao_iniciar(self):
        if self.instalado() and self.logado() and not self._modelos_arq().exists():
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

    # ---- o login (`agent login`: o link da página do Cursor; o `agent` confere sozinho e escreve "Logged in as …")
    def logado(self):
        return self._token().exists() or bool(self.le_chave())

    def login_estado(self):
        with self._trava:
            l = self._login
            return {k: l.get(k) for k in ("andamento", "url", "erro", "desde")} if l else None

    def estado(self):
        token, k = self._token().exists(), self.le_chave()
        email = None
        if token:
            try:
                email = json.loads(self._conta().read_text()).get("email")
            except (OSError, ValueError, AttributeError):
                pass
        metodo = next((m for m in self.ordem() if (m == "login" and token) or (m == "chave" and k)), None)
        return {"id": self.id, "nome": self.nome, "instalado": self.instalado(), "logado": bool(token or k),
                "email": email if metodo == "login" else None, "modo": metodo,
                "metodo": lingua.tr("ia_cursor.metodo_chave" if metodo == "chave" else "ia_cursor.metodo_login"),
                "chave": self.mascara(k), "entradas": list(self.ordem()), "modo_login": self.modo_login,
                "pasta": str(self.pasta).replace(str(Path.home()), "~", 1), "login": self.login_estado()}

    def entra(self):
        if not self.instalado():
            raise ValueError(lingua.tr("pedido.ferramenta_nao_instalada", ia=self.nome))
        self._confere_casa()
        with self._trava:
            p = self._login.get("proc")
            if p is None or p.poll() is not None:
                env = self.ambiente()
                env.pop("CURSOR_API_KEY", None)            # o login é o da conta (a chave, se houver, fica de fora)
                try:
                    proc = subprocess.Popen([*self.argv(), "login"], env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                            stderr=subprocess.STDOUT, text=True, errors="replace", cwd=str(self.pasta), **processos.GRUPO)
                except (OSError, ValueError) as e:
                    raise ValueError(lingua.tr("ia_cursor.login_nao_abriu", nome=self.nome, erro=str(e)))
                self._login = {"proc": proc, "andamento": True, "url": None, "erro": None, "desde": time.time(), "saida": ""}
                lingua.thread(self._acompanha_login, proc).start()
        for _ in range(150):                               # o `agent` leva uns segundos para dar o link
            l = self.login_estado() or {}
            if l.get("url") or not l.get("andamento"):
                break
            time.sleep(0.1)
        return self.estado()

    def _acompanha_login(self, proc):
        prazo = threading.Timer(LOGIN_PRAZO, lambda: processos.encerra(proc.pid) if proc.poll() is None else None)
        prazo.daemon = True
        prazo.start()
        email = None
        try:
            for linha in proc.stdout:
                linha = ANSI.sub("", linha)
                with self._trava:
                    if self._login.get("proc") is not proc:
                        break
                    self._login["saida"] = (self._login.get("saida", "") + linha)[-4000:]
                    m = URL_LOGIN.search(linha)
                    if m and not self._login.get("url"):
                        self._login["url"] = m.group(0)
                m = ENTROU.search(linha)
                if m:
                    email = m.group(1)
            proc.wait(timeout=30)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
        finally:
            prazo.cancel()
        ok = proc.returncode == 0 and (email is not None or self._token().exists())
        if ok:
            try:
                self._grava_json(self._conta(), {"email": email, "quando": time.time()})
            except OSError:
                pass                                       # sem o e-mail na tela; o login vale (o arquivo é do `agent`)
        with self._trava:
            if self._login.get("proc") is not proc:
                return
            if ok:
                self._login = {}
                lingua.thread(self.atualiza_modelos).start()   # a lista da conta, depois (a tela já mostra "conectado")
                return
            fim = [x.strip() for x in self._login.get("saida", "").splitlines() if x.strip() and not URL_LOGIN.search(x)]
            prazo_passou = time.time() - self._login.get("desde", time.time()) >= LOGIN_PRAZO - 1
            self._login.update(proc=None, andamento=False,
                               erro=lingua.tr("ia_cursor.login_prazo") if prazo_passou else (fim[-1][:300] if fim else lingua.tr("ia_cursor.login_falhou", codigo=proc.returncode)))

    def cancela(self):
        with self._trava:
            p = self._login.get("proc")
            self._login = {}
        if p is not None and p.poll() is None:
            processos.encerra(p.pid)

    def valida_chave(self, k):
        """A chave colada (ComChave.codigo já conferiu a forma): conferida com o próprio `agent` (`agent models` com a chave: não
        gasta o modelo e já traz a lista da conta). Recusada pelo `agent`: ValueError, sem repetir a chave; sem rede ou outro
        erro, ela fica (o pedido dirá se não valer)."""
        if not self.instalado():
            raise ValueError(lingua.tr("pedido.ferramenta_nao_instalada", ia=self.nome))
        self._confere_casa()
        cod, err = self.atualiza_modelos(chave=k)
        if cod not in (0, None) and (CHAVE_RUIM.search(err) or SEM_LOGIN.search(err)):
            raise ValueError(lingua.tr("ia_cursor.chave_recusada", nome=self.nome))

    def sai(self):
        """Sai das duas entradas: `agent logout` (o próprio `agent` apaga o login dele) e a chave guardada pelo MaiSim."""
        self.cancela()
        erro = None
        if self._token().exists() and self.instalado():
            env = self.ambiente()
            env.pop("CURSOR_API_KEY", None)
            try:
                r = subprocess.run([*self.argv(), "logout"], env=env, capture_output=True, text=True, timeout=60,
                                   stdin=subprocess.DEVNULL, cwd=str(self.pasta))
                erro = None if r.returncode == 0 else ((r.stderr or r.stdout).strip().splitlines() or [str(r.returncode)])[-1][:200]
            except (subprocess.SubprocessError, OSError, ValueError) as e:
                erro = str(e)
        self._conta().unlink(missing_ok=True)
        try:
            self.arquivo_chave().unlink(missing_ok=True)
        except OSError as e:
            raise ValueError(lingua.tr("ia_conta.chave_nao_apagou", nome=self.nome, erro=e.strerror or type(e).__name__))
        if erro and self._token().exists():
            raise ValueError(lingua.tr("ia_cursor.sair_falhou", nome=self.nome, erro=erro))
        return self.estado()
