"""A DeepSeek como IA do MaiSim: o próprio Claude Code (o mesmo `claude` do Claude, os mesmos comandos e a mesma leitura
da saída) falando com o endpoint da DeepSeek compatível com a API da Anthropic, com a chave de API da pessoa (cobrança por
uso, na chave dela). Conferido em 25/10/2026 nas páginas da DeepSeek (api-docs.deepseek.com: guides/anthropic_api e
quick_start/agent_integrations/claude_code) e do Claude Code (code.claude.com/docs/en/llm-gateway-connect):

- ANTHROPIC_BASE_URL = https://api.deepseek.com/anthropic e a chave em ANTHROPIC_AUTH_TOKEN (Authorization: Bearer), como
  manda a página da DeepSeek para o Claude Code. A variável de credencial vale mais que um login do claude.ai salvo, e a
  ANTHROPIC_AUTH_TOKEN vale na hora (a ANTHROPIC_API_KEY pediria uma aprovação numa sessão interativa); sem --bare. E a
  pasta de configuração é só da DeepSeek (~/.deepseek-maisim; no Windows instalado, %APPDATA%\\MaiSim\\deepseek), sem
  login nenhum: nada mistura com o login do Claude, e as ANTHROPIC_* só existem no ambiente do processo da DeepSeek.
- Modelos: o --model continua um apelido que o Claude Code conhece (opus, sonnet) e as variáveis ANTHROPIC_DEFAULT_*_MODEL
  o levam aos nomes da DeepSeek: "V4 Pro" = opus → deepseek-v4-pro, "Flash" = sonnet → deepseek-flash (o endpoint também
  mapeia sozinho claude-opus* → deepseek-v4-pro e os outros claude* → deepseek-flash). A tarefa de fundo (haiku) e um
  subagente vão para o Flash. Esforço: só o padrão.
- CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1: sem a telemetria e a busca de versão nova para a Anthropic nestas chamadas.
- O saldo: GET https://api.deepseek.com/user/balance (Bearer), guardado 60 s. A chave colada é conferida pela mesma
  chamada: 401/403 recusa; sem rede, ela fica (o pedido dirá depois). MAISIM_DEEPSEEK_SEM_REDE=1 (a instância de teste):
  nenhuma chamada à DeepSeek."""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request

from .base import ComChave, lingua
from .claude import Claude

URL_BASE = "https://api.deepseek.com/anthropic"
URL_SALDO = "https://api.deepseek.com/user/balance"
MODELO_DE = {"opus": "deepseek-v4-pro", "sonnet": "deepseek-flash", "haiku": "deepseek-flash"}


class DeepSeek(ComChave, Claude):
    id = "deepseek"
    nome = "DeepSeek"
    modelos = ("opus", "sonnet")
    esforcos = ("",)
    inicio_chave = "sk-"
    forma_chave = re.compile(r"sk-[A-Za-z0-9_\-]{16,200}")

    def __init__(self, binario, pasta):
        super().__init__(binario, pasta)
        self._saldo = {"chave": None, "t": 0.0, "v": None}

    def rotulos(self):
        return {"opus": "V4 Pro", "sonnet": "Flash"}

    def sem_rede(self):
        return os.environ.get("MAISIM_DEEPSEEK_SEM_REDE") == "1"

    def ambiente(self, **extra):
        env = super().ambiente(**extra)
        env.update(ANTHROPIC_BASE_URL=URL_BASE, ANTHROPIC_DEFAULT_OPUS_MODEL=MODELO_DE["opus"],
                   ANTHROPIC_DEFAULT_SONNET_MODEL=MODELO_DE["sonnet"], ANTHROPIC_DEFAULT_HAIKU_MODEL=MODELO_DE["haiku"],
                   CLAUDE_CODE_SUBAGENT_MODEL=MODELO_DE["sonnet"], CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1")
        k = self.le_chave()
        if k:                                            # sem a chave o pedido nem começa (ia_logada); o resumo também
            env["ANTHROPIC_AUTH_TOKEN"] = k
        return env

    # o Claude Code aqui não tem login OAuth: nem a trava de renovação dele, nem o erro passageiro dela
    def trava_login(self):
        return None

    def erro_passageiro(self, texto):
        return False

    def _pede_saldo(self, k):
        """GET /user/balance com a chave: (código HTTP, JSON ou None). A chave só vai no cabeçalho; nada dela no erro."""
        req = urllib.request.Request(URL_SALDO, headers={"Authorization": f"Bearer {k}", "Accept": "application/json",
                                                         "User-Agent": "MaiSim"})
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, None
        except (urllib.error.URLError, OSError, ValueError):
            return None, None

    def valida_chave(self, k):
        if self.sem_rede():
            return
        cod, _ = self._pede_saldo(k)
        if cod in (401, 403):
            raise ValueError(lingua.tr("ia_conta.chave_recusada", nome=self.nome, motivo=f"HTTP {cod}"))

    def uso(self, forca=False):
        """O saldo da chave ({"itens": [], "saldo": {valor, moeda}}), em dólar se houver; None sem chave, sem rede ou se a
        DeepSeek não responder."""
        k = self.le_chave()
        if not k or self.sem_rede():
            return None
        h = hashlib.sha256(k.encode()).hexdigest()       # o guardado vale para esta chave (trocou: lê de novo)
        c = self._saldo
        if not forca and c["chave"] == h and time.time() - c["t"] < 60:
            return c["v"]
        cod, j = self._pede_saldo(k)
        v = None
        infos = (j or {}).get("balance_infos") or []
        info = next((x for x in infos if x.get("currency") == "USD"), infos[0] if infos else None)
        if cod == 200 and info:
            try:
                v = {"itens": [], "saldo": {"valor": float(info.get("total_balance")), "moeda": str(info.get("currency") or "USD")},
                     "quando": time.time()}
            except (TypeError, ValueError):
                v = None
        self._saldo = {"chave": h, "t": time.time(), "v": v}
        return v
