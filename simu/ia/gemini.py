"""O Gemini como IA do MaiSim (etapa 3 do hub de IA): o Gemini CLI oficial (`gemini`, conferido no 0.63.0), com a conta Google
da pessoa (a cota grátis do Gemini Code Assist para pessoas físicas, ou o plano dela), numa pasta só do MaiSim
(GEMINI_CLI_HOME = ~/.gemini-maisim: o login, as sessões e as configurações; o ~/.gemini da pessoa não muda). O servidor nunca
lê a credencial: quem grava .gemini/oauth_creds.json é o CLI, e o MaiSim só confere se o arquivo existe.

Pedido: `gemini -p` em stream-json, com a política de ferramentas do MaiSim no nível de administrador (--admin-policy, o mais
alto: nada a sobrepõe). Só ler, listar e procurar arquivos, e escrever ou editar os arquivos do controle DESTA pasta (os
editáveis e os .py, no nível de cima); todo o resto (shell, web, memória, MCP, subagentes, perguntar ao usuário) é negado, e
o que é negado de vez some da vista do modelo. A mesma política só de leitura fica também no nível do usuário: se a do
administrador não carregasse, ele só leria. As regras do MaiSim vão em GEMINI.md na pasta (o CLI lê como contexto). A sessão
é por id: --session-id na primeira chamada, --resume <id> depois.
Resumo de um contexto salvo: `gemini -p` em JSON, só leitura.
Login: o `gemini` interativo num terminal (pty) com NO_BROWSER — ele mostra o link do Google e espera o código que a página
mostra depois de autorizar; o MaiSim mostra o link e repassa o código colado. Sair: apaga os arquivos do login na pasta do MaiSim
(o mesmo que o CLI faz no logout)."""
import json
import os
import re
import threading
import time
from pathlib import Path

from .base import IA
from .login_pty import LoginPorTerminal
import lingua  # noqa: E402                    as mensagens no idioma do pedido (o config/ entra no sys.path pelo base)

# os nomes das ferramentas do Gemini → os do MaiSim (a linha "lendo controle.py" da tela)
FERRAMENTAS = {"read_file": "Read", "read_many_files": "Read", "list_directory": "Glob", "glob": "Glob", "grep_search": "Grep",
               "write_file": "Write", "replace": "Edit"}
LEITURA = ("read_file", "read_many_files", "list_directory", "glob", "grep_search")
# a configuração do CLI na pasta do MaiSim: login pela conta Google, sem atualização automática e sem estatísticas de uso
CONFIG = {"security": {"auth": {"selectedType": "oauth-personal"}},
          "general": {"enableAutoUpdate": False, "enableAutoUpdateNotification": False},
          "privacy": {"usageStatisticsEnabled": False}, "telemetry": {"enabled": False}}
URL_LOGIN = re.compile(r"https://accounts\.google\.com/o/oauth2/v2/auth\?[^\s\x1b\x07]+")
NEGA = "o MaiSim não deixa: só ler, listar e procurar arquivos, e escrever ou editar os do controle (os editáveis e os .py) desta pasta"


def _re(texto):
    """Escapa para a expressão regular do JavaScript (sem o \\- do re.escape, que o modo unicode recusa)."""
    return re.sub(r"([.^$*+?()\[\]{}|\\/])", r"\\\1", texto)


def _grava(arq, texto):
    """Grava se mudou (troca atômica: outro `gemini` lendo ao mesmo tempo vê o antigo ou o novo, nunca a metade)."""
    try:
        if arq.read_text() == texto:
            return
    except OSError:
        pass
    arq.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = arq.with_name(f".{arq.name}.{os.getpid()}.{threading.get_ident()}")
    tmp.write_text(texto)
    os.replace(tmp, arq)


def politica(regras_escrita=None):
    """A política do MaiSim em TOML: nega tudo (prioridade 1), libera a leitura e, se houver, a escrita com o argsPattern dado."""
    t = ("# Gerada pelo MaiSim (ia/gemini.py) a cada chamada; passada com --admin-policy (o nível de administrador: nada a sobrepõe).\n"   # i18n-ok (comentário do arquivo da política)
         "[[rule]]\ntoolName = \"*\"\ndecision = \"deny\"\npriority = 1\n"
         f"denyMessage = \"{NEGA}\"\n\n"
         "[[rule]]\ntoolName = [" + ", ".join(f'"{x}"' for x in LEITURA) + "]\ndecision = \"allow\"\npriority = 100\n")
    if regras_escrita:
        t += ("\n[[rule]]\ntoolName = [\"write_file\", \"replace\"]\n"
              f"argsPattern = '{regras_escrita}'\ndecision = \"allow\"\npriority = 100\n")
    return t


def padrao_escrita(pasta, editaveis):
    """O argsPattern da escrita: file_path (o argumento, no texto JSON estável do CLI: cada par do nível de cima entre \\0)
    é um dos editáveis ou um .py, no nível de cima desta pasta (caminho absoluto, ./nome ou só o nome). Sem quantificador
    aninhado (o CLI recusa a expressão)."""
    base = str(Path(pasta).resolve())
    if re.search(r"['\"\\\x00-\x1f]", base):
        raise ValueError(lingua.tr("ia_conta.gemini_pasta_char", pasta=repr(base)))
    nomes = [_re(n) for n in editaveis if re.fullmatch(r"[A-Za-z0-9_.\-]+", n)] + [r"[A-Za-z_][A-Za-z0-9_]*\.py"]
    return '\\x00"file_path":"(?:' + _re(base) + '/|\\./|)(?:' + "|".join(nomes) + ')"\\x00'


class Gemini(LoginPorTerminal, IA):
    id = "gemini"
    nome = "Gemini"
    variavel_pasta = "GEMINI_CLI_HOME"
    modelos = ("", "pro", "flash", "flash-lite")      # os apelidos do `gemini -m` ("" = o automático da conta)
    esforcos = ("",)
    tem_login = True

    def __init__(self, binario, pasta):
        super().__init__(binario, pasta)
        self._login_init()

    # ---- o ambiente e a configuração
    def ambiente(self, **extra):
        env = super().ambiente(**extra)
        # o `gemini` é um script do Node (#!/usr/bin/env node): a pasta dele (a do Node do nvm) vem na frente no PATH
        env["PATH"] = os.path.dirname(self.bin) + os.pathsep + env.get("PATH", "/usr/bin:/bin")
        # o Node tenta o IPv6 e o IPv4 de cada endereço com 250 ms por tentativa; no WSL (sem rota IPv6) o IPv4 até o Google
        # leva ~290 ms e o Node desistia: "request to https://oauth2.googleapis.com/token failed, reason:" (vazio) no login
        # do Marcelo (21/10), com o curl chegando normal. 2 s por tentativa (o CLI repassa o NODE_OPTIONS ao se relançar)
        env["NODE_OPTIONS"] = "--network-family-autoselection-attempt-timeout=2000"
        return env

    def _prepara(self, passos=None):
        """A configuração do CLI na pasta do MaiSim (só as chaves do MaiSim; o resto do arquivo fica)."""
        self.pasta.mkdir(mode=0o700, parents=True, exist_ok=True)
        arq = self.pasta / ".gemini" / "settings.json"
        try:
            atual = json.loads(arq.read_text())
            if not isinstance(atual, dict):
                atual = {}
        except (OSError, ValueError):
            atual = {}
        novo = json.loads(json.dumps(atual))
        for k, v in CONFIG.items():
            novo[k] = {**(novo.get(k) if isinstance(novo.get(k), dict) else {}), **v}
        if passos:
            novo["model"] = {**(novo.get("model") if isinstance(novo.get("model"), dict) else {}), "maxSessionTurns": int(passos)}
        _grava(arq, json.dumps(novo, ensure_ascii=False, indent=2) + "\n")
        # a segunda trava: a mesma política só de leitura no nível do usuário (o CLI a lê sozinho em .gemini/policies). Se a
        # do administrador (a de cada chamada) não carregasse, o Gemini continuaria só lendo — nunca solto
        _grava(self.pasta / ".gemini" / "policies" / "maisim_base.toml", politica())

    # ---- o pedido e o resumo
    def comando(self, prompt, sessao, retoma, regras, modelo="", esforco="", passos=100, editaveis=(), pasta=None):
        if pasta is None:
            raise ValueError(lingua.tr("ia_conta.gemini_sem_pasta"))
        self._prepara(passos)
        pol = self.pasta / "maisim" / "politica_pedido.toml"
        _grava(pol, politica(padrao_escrita(pasta, editaveis)))
        (Path(pasta) / "GEMINI.md").write_text(regras)           # as regras do MaiSim: o CLI lê GEMINI.md como contexto
        return [self.bin, "-p", prompt, "--output-format", "stream-json", "--skip-trust", "--approval-mode", "default",
                "--admin-policy", str(pol), *(["--model", modelo] if modelo else []),
                *(["--resume", sessao] if retoma else ["--session-id", sessao])]

    def comando_resumo(self, prompt, modelo="", esforco="", pasta=None):
        self._prepara()
        pol = self.pasta / "maisim" / "politica_leitura.toml"
        _grava(pol, politica())
        return [self.bin, "-p", prompt, "--output-format", "json", "--skip-trust", "--approval-mode", "default",
                "--admin-policy", str(pol), *(["--model", modelo] if modelo else [])]

    def sessao_existe(self, sid):
        # o CLI grava a sessão em .gemini/tmp/<projeto>/chats/session-<quando>-<8 primeiros do id>.json(l)
        return any((self.pasta / ".gemini" / "tmp").glob(f"*/chats/session-*-{str(sid)[:8]}.json*"))

    # ---- a saída (stream-json): init, message (o texto em pedaços, delta), tool_use, tool_result, error, result
    def traduz(self, ev, estado=None):
        st = estado if estado is not None else {}
        t, out = ev.get("type"), []

        def turno_novo():
            if st.pop("depois_ferramenta", False):
                st["turnos"] = st.get("turnos", 1) + 1

        def solta_texto():
            txt = st.pop("turno", "").strip()
            if txt:
                out.append({"tipo": "texto", "texto": txt})
            return txt

        if t == "init":
            st.update(modelo=ev.get("model"), turnos=1)
            out.append({"tipo": "inicio", "modelo": ev.get("model")})
        elif t == "message" and ev.get("role") == "assistant":
            turno_novo()
            st["turno"] = st.get("turno", "") + str(ev.get("content") or "")
        elif t == "tool_use":
            turno_novo()
            solta_texto()                                   # o que ela disse antes de usar a ferramenta
            nome, ent = ev.get("tool_name") or "", ev.get("parameters") or {}
            st.setdefault("usos", {})[ev.get("tool_id")] = (nome, ent)
            out.append({"tipo": "ferramenta", "nome": FERRAMENTAS.get(nome, nome), "entrada": ent})
        elif t == "tool_result":
            st["depois_ferramenta"] = True
            if ev.get("status") == "error":
                err = ev.get("error") or {}
                out.append({"tipo": "recusa", "msg": str(err.get("message") or ev.get("output") or lingua.tr("ia_conta.erro_ferramenta")).strip()})
                if err.get("type") == "policy_violation":
                    nome, ent = st.get("usos", {}).get(ev.get("tool_id"), ("?", {}))
                    st.setdefault("negados", []).append({"nome": nome, "entrada": ent})
        elif t == "error":
            if ev.get("severity") == "error":
                st.setdefault("erros", []).append(str(ev.get("message") or ""))
        elif t == "result":
            texto = solta_texto()
            err, stats = ev.get("error") or {}, ev.get("stats") or {}
            erro = ev.get("status") != "success"
            # o modelo que respondeu: o de mais tokens de saída (o "auto" do init escolhe; o roteador também aparece aqui)
            modelos = sorted((stats.get("models") or {}).items(), key=lambda kv: int((kv[1] or {}).get("output_tokens") or 0))
            out.append({"tipo": "resultado", "erro": erro,
                        "texto": (err.get("message") or None) if erro else (texto or None),
                        "erros": list(st.get("erros") or []), "subtipo": err.get("type"),
                        "limite_passos": err.get("type") == "FatalTurnLimitedError",
                        "uso": {"entrada": int(stats.get("input_tokens") or 0), "saida": int(stats.get("output_tokens") or 0)},
                        "turnos": st.get("turnos"), "ms": stats.get("duration_ms"), "custo": None,
                        "negados": list(st.get("negados") or []), "modelo": (modelos[-1][0] if modelos else None) or st.get("modelo")})
        return out

    def le_resultado_json(self, ev):
        """O `gemini -o json`: {session_id, response, stats, error}."""
        if not isinstance(ev, dict) or not ev:
            return None
        err = ev.get("error") or {}
        modelos = sorted(((ev.get("stats") or {}).get("models") or {}).items(),
                         key=lambda kv: int(((kv[1] or {}).get("tokens") or {}).get("candidates") or 0))
        return {"tipo": "resultado", "erro": bool(err), "texto": err.get("message") if err else ev.get("response"),
                "erros": [str(w) for w in ev.get("warnings") or []], "subtipo": err.get("type"), "limite_passos": False,
                "uso": {"entrada": 0, "saida": 0}, "turnos": None, "ms": None, "custo": None, "negados": [],
                "modelo": modelos[-1][0] if modelos else None}

    def erro_conhecido(self, texto):
        if re.search(r"IneligibleTierError|no longer supported for Gemini Code Assist for individuals", texto or ""):
            # a resposta do Google em 21/10 (conta pessoal do Marcelo, com Google AI Ultra): o Gemini CLI não atende mais
            # contas pessoais; elas vão pelo Antigravity
            return lingua.tr("ia_conta.gemini_nao_atende")
        return None

    # ---- o login (conta Google)
    def _creds(self):
        return self.pasta / ".gemini" / "oauth_creds.json"

    def estado(self):
        g = self.pasta / ".gemini"
        logado = self._creds().exists()                      # só se existe: o MaiSim não lê a credencial
        email = None
        if logado:
            try:                                             # a conta ativa (só o e-mail; não é credencial)
                email = json.loads((g / "google_accounts.json").read_text()).get("active")
            except (OSError, ValueError, AttributeError):
                pass
        return {"id": self.id, "nome": self.nome, "instalado": self.instalado(), "logado": logado, "email": email,
                "metodo": lingua.tr("ia_conta.metodo_google"), "pasta": str(self.pasta).replace(str(Path.home()), "~", 1), "login": self.login_estado()}

    # o login pelo terminal (login_pty): o gemini interativo com NO_BROWSER mostra o link e espera o código
    LOGIN_URL = URL_LOGIN
    LOGIN_ERROS = re.compile(r"(Failed to authenticate[^\r\n]*|Authorization timed out[^\r\n]*|Authorization code is required)")

    def login_argv(self):
        return [self.bin, "--skip-trust"]

    def login_env(self):
        return self.ambiente(NO_BROWSER="true", TERM="xterm-256color")

    def _prepara_login(self):
        self._prepara()
        self._ok_desde = None

    def logado(self):
        return self._creds().exists()

    def login_terminou(self, texto):
        if not self._creds().exists():                   # o login deu certo: espera a conta (google_accounts.json) até 5 s
            return None
        self._ok_desde = getattr(self, "_ok_desde", None) or time.time()
        if (self.pasta / ".gemini" / "google_accounts.json").exists() or time.time() - self._ok_desde > 5:
            return (True, None)
        return None

    def sai(self):
        self.cancela()
        g = self.pasta / ".gemini"
        for f in ("oauth_creds.json", "google_accounts.json"):   # o mesmo que o logout do CLI (não lê, só apaga)
            (g / f).unlink(missing_ok=True)
        with self._trava:
            self._login.clear()
        out = self.estado()
        if out["logado"]:
            raise ValueError(lingua.tr("ia_conta.gemini_logout"))
        return out
