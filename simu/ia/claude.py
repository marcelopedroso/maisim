"""O Claude como IA do PEW: o Claude Code (`claude`, conferido no CLI 2.1.273), com a pasta de configuração do PEW
(~/.claude-pew, o login dele; o servidor nunca lê as credenciais — quem faz o login é o próprio CLI).

Pedido: `claude -p` restrito (só Read, Edit, Write, Glob e Grep; Edit só nos arquivos editáveis da pasta e nos .py; sem
shell, sem MCP, sem perguntar), stream-json, retomando a sessão da conversa (--resume) ou criando (--session-id).
Resumo de um contexto: `claude -p` só com leitura, sem sessão, saída JSON."""
import re

from .base import IA

RENOVA_LOGIN = re.compile(r"Failed to refresh OAuth token|another Claude Code process is refreshing", re.I)


class Claude(IA):
    id = "claude"
    nome = "Claude"
    variavel_pasta = "CLAUDE_CONFIG_DIR"
    modelos = ("", "fable", "opus", "sonnet", "haiku")
    esforcos = ("", "low", "medium", "high", "xhigh", "max")

    def ambiente(self, **extra):
        return super().ambiente(FORCE_HYPERLINK="0", **extra)

    def comando(self, prompt, sessao, retoma, regras, modelo="", esforco="", passos=100, editaveis=(), pasta=None):
        cmd = [self.bin, "-p", prompt, "--output-format", "stream-json", "--verbose", "--restricted",
               "--tools", "Read,Edit,Write,Glob,Grep", "--allowedTools", *[f"Edit(./{f})" for f in editaveis], "Edit(./*.py)", "Write(./*.py)",
               "--permission-mode", "dontAsk", "--permission-prompts", "none", "--strict-mcp-config", "--max-turns", str(passos),
               *(["--model", modelo] if modelo else []), *(["--effort", esforco] if esforco else []),
               "--append-system-prompt", regras]
        # retoma a conversa se o CLI já gravou a sessão (mesmo de um 1º pedido parado: --session-id com a sessão gravada o
        # CLI recusa, "already in use"); sessão apagada: recomeça com o mesmo id, sem travar
        return cmd + (["--resume", sessao] if retoma else ["--session-id", sessao])

    def comando_resumo(self, prompt, modelo="", esforco="", pasta=None):
        return [self.bin, "-p", prompt, "--output-format", "json", "--restricted", "--tools", "Read,Glob,Grep",
                "--permission-mode", "dontAsk", "--permission-prompts", "none", "--strict-mcp-config", "--no-session-persistence",
                "--max-turns", "30", *(["--model", modelo] if modelo else []), *(["--effort", esforco] if esforco else [])]

    def comando_estado(self):
        return [self.bin, "auth", "status", "--json"]

    def le_estado(self, st):
        return dict(logado=bool(st.get("loggedIn")), metodo=st.get("authMethod"), email=st.get("email"),
                    plano=st.get("subscriptionType"), organizacao=st.get("orgName"))

    def comando_uso(self):
        return [self.bin, "-p", "/usage", "--output-format", "json", "--tools", "", "--no-session-persistence"]

    def sessao_existe(self, sid):
        return any((self.pasta / "projects").glob(f"*/{sid}.jsonl"))

    def trava_login(self):
        return self.pasta / ".oauth_refresh.lock"

    def erro_passageiro(self, texto):
        return bool(RENOVA_LOGIN.search(texto or ""))

    def traduz(self, ev, estado=None):
        t, out = ev.get("type"), []
        if t == "system" and ev.get("subtype") == "init":
            out.append({"tipo": "inicio", "modelo": ev.get("model")})
        elif t == "assistant":
            for b in (ev.get("message") or {}).get("content") or []:
                if b.get("type") == "text" and b.get("text"):
                    out.append({"tipo": "texto", "texto": b["text"]})
                elif b.get("type") == "tool_use":
                    out.append({"tipo": "ferramenta", "nome": b.get("name"), "entrada": b.get("input") or {}})
        elif t == "user":
            for b in (ev.get("message") or {}).get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("is_error"):
                    msg = b.get("content")
                    msg = " ".join(x.get("text", "") for x in msg if isinstance(x, dict)) if isinstance(msg, list) else str(msg or "")
                    out.append({"tipo": "recusa", "msg": msg.strip()})
        elif t == "result":
            uso = ev.get("usage") or {}
            out.append({"tipo": "resultado", "erro": bool(ev.get("is_error")), "texto": ev.get("result"),
                        "erros": [str(x) for x in ev.get("errors") or []], "subtipo": ev.get("subtype"),
                        "limite_passos": ev.get("subtype") == "error_max_turns",
                        "uso": {"entrada": sum(int(uso.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")),
                                "saida": int(uso.get("output_tokens") or 0)},
                        "turnos": ev.get("num_turns"), "ms": ev.get("duration_ms"), "custo": ev.get("total_cost_usd"),
                        "negados": [{"nome": d.get("tool_name"), "entrada": d.get("tool_input") or {}} for d in ev.get("permission_denials") or []],
                        "modelo": ev.get("model")})
        return out
