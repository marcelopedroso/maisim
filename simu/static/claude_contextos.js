// PEW / simu — os contextos salvos (Marcelo, 21/10: "um botãozinho para salvar isso na memória não volátil… usar em outras
// conversas"; servidor: contextos.py e as rotas claude/contexto*). "salvar": a conversa vira um contexto (a nota de quem
// salva — "a pessoa escreve o que acha importante", sem resumo pela IA —, a conversa, o controle e a rodada daquele
// momento); "contextos": a biblioteca — usar nesta
// conversa (a IA lê a nota e a conversa em todo pedido), abrir, editar, exportar (.pewctx), importar e apagar — e as conversas
// anteriores (as que o "nova" deixou), que também podem ser salvas.
const cx = { lista: null, aba: "salvos", filtro: "" };

function cxModal(cls, html) {
  const fundo = document.createElement("div"); fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal cx-modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(fundo);
  const fecha = () => { removeEventListener("keydown", tecla, true); fundo.remove(); };
  const tecla = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fecha(); } else ev.stopPropagation(); };
  addEventListener("keydown", tecla, true);
  return { fundo, fecha, q: (s) => fundo.querySelector(s) };
}
const cxData = (q) => (typeof q === "number" ? new Date(q * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : String(q || ""));
const cxTam = (b) => (b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
const cxCircuito = (c) => String(c || "").split("/").pop().replace(/\.ipes$/, "");

// ---- salvar a conversa (a aberta, ou uma anterior: sid) como contexto
async function cxSalvar(sid = null, tituloSugerido = "") {
  const e = cc.estado || {}, conv = e.conversa || {}, atual = !sid;
  const hist = atual ? conv.historico || [] : [];
  const titulo = tituloSugerido || `${cxCircuito(conv.circuito) || "conversa"} ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  const m = cxModal("cx-salvar", `<h3>Salvar ${atual ? "esta conversa" : "a conversa anterior"} como contexto</h3>
    <p class="cc-dica-t">Fica guardado no PEW (fora do repositório): use em outra conversa — e, depois, em outra IA — ou exporte para o time.</p>
    <label class="cx-l">título <input class="cx-titulo" maxlength="200"></label>
    <label class="cx-l">etiquetas <input class="cx-etiquetas" placeholder="separadas por vírgula (ex.: controle, ensaio, artigo)"></label>
    <div class="cx-inclui">incluir: <label><input type="checkbox" class="cx-i" data-k="conversa" checked> a conversa</label>
      <label title="${atual ? "o controle em uso agora" : "o controle da última proposta aplicada naquela conversa"}"><input type="checkbox" class="cx-i" data-k="controle" checked> o controle</label>
      ${atual ? `<label title="o resumo e as séries da rodada mais nova"><input type="checkbox" class="cx-i" data-k="rodada" checked> a rodada</label>` : ""}
      <label title="${(conv.anexos || []).map((a) => a.nome).join(", ") || "sem anexos"}"><input type="checkbox" class="cx-i" data-k="anexos"${!atual || (conv.anexos || []).length ? "" : " disabled"}> os anexos</label></div>
    <div class="cx-res-cab"><b>nota</b> <span class="cc-dica-t">o que você quer lembrar depois (opcional) — fica no topo do contexto; a conversa inteira vai junto</span>
      <label class="cx-ia" title="depois de salvar, em segundo plano: a IA lê a conversa guardada (só leitura) e escreve um resumo, que entra no contexto. Não aparece na conversa. O salvar não depende dele: se falhar, a biblioteca oferece gerar de novo. Gasta uso (conversa grande, mais)"><input type="checkbox" class="cx-resumo-ia"${(atual ? hist.length : 1) ? "" : " disabled"}> resumo pela IA, depois de salvar</label></div>
    <textarea class="cx-resumo" spellcheck="false" placeholder="o que é importante lembrar: o resultado, o que funcionou, o que falta…"></textarea>
    <div class="cx-status cc-dica-t"></div>
    <div class="modal-botoes"><button class="m-fechar">cancelar</button><button class="m-guardar primario">guardar</button></div>`);
  m.q(".cx-titulo").value = titulo; m.q(".cx-titulo").select(); m.q(".cx-titulo").focus();
  m.q(".m-fechar").onclick = m.fecha;
  const status = (t) => { m.q(".cx-status").textContent = t; };
  m.q(".m-guardar").onclick = async () => {
    const incluir = {}; m.fundo.querySelectorAll(".cx-i").forEach((c) => { incluir[c.dataset.k] = c.checked; });
    try {
      const ia = m.q(".cx-resumo-ia").checked && incluir.conversa;
      const r = await apiClaude("contexto/salvar", { conversa: sid || undefined, titulo: m.q(".cx-titulo").value, etiquetas: m.q(".cx-etiquetas").value,
        resumo: m.q(".cx-resumo").value, incluir, resumo_ia: ia, modelo: $("cc-modelo").value, esforco: $("cc-esforco").value, ia: ccIA() });
      cx.lista = r; m.fecha(); cc.aviso = ""; cc.avisoOk = `contexto salvo: ${m.q(".cx-titulo").value || r.id}${ia ? " — o resumo pela IA vem em segundo plano (veja em contextos)" : ""}`; desenhaChat();
      setTimeout(() => { cc.avisoOk = ""; desenhaChat(); }, 8000);
    } catch (err) { status(err.message); }
  };
}

// ---- a biblioteca
async function cxBiblioteca() {
  const m = cxModal("cx-bib", `<h3>Contextos</h3>
    <div class="cx-abas"><button data-aba="salvos">salvos</button><button data-aba="anteriores" title="as conversas que o “nova” deixou (continuam guardadas): salve uma como contexto">conversas anteriores</button>
      <input class="cx-filtro" placeholder="filtrar (título, etiqueta, circuito)"><button class="cx-importar" title="importar um contexto de um colega (.pewctx)">importar…</button>
      <input type="file" class="cx-arq" accept=".pewctx,.zip" hidden></div>
    <div class="cx-corpo"></div><div class="cx-status cc-dica-t"></div>
    <div class="modal-botoes"><button class="m-fechar">fechar</button></div>`);
  m.q(".m-fechar").onclick = m.fecha;
  const status = (t) => { m.q(".cx-status").textContent = t; };
  const carrega = async () => { try { cx.lista = await apiClaude("contextos"); } catch (err) { status(err.message); } desenha(); vigia(); };
  let tVigia = null;                                   // um resumo pela IA gerando: a lista se atualiza a cada 3 s
  const vigia = () => {
    clearTimeout(tVigia);
    if (document.body.contains(m.fundo) && ((cx.lista || {}).contextos || []).some((c) => (c.resumo_ia || {}).estado === "gerando")) tVigia = setTimeout(carrega, 3000);
  };
  const desenha = () => {
    m.fundo.querySelectorAll(".cx-abas [data-aba]").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === cx.aba));
    const L = cx.lista || { contextos: [], anteriores: [], usados: [] }, f = cx.filtro.toLowerCase();
    if (cx.aba === "salvos") {
      const itens = L.contextos.filter((c) => !f || [c.titulo, ...(c.etiquetas || []), c.circuito].join(" ").toLowerCase().includes(f));
      m.q(".cx-corpo").innerHTML = itens.length ? itens.map((c) => {
        const usado = (L.usados || []).includes(c.id);
        return `<div class="cx-item${usado ? " usado" : ""}" data-id="${escT(c.id)}"><div class="cx-tit">${escT(c.titulo)}${c.importado ? ` <span class="cx-imp" title="importado de ${escT(c.importado.autor_original || "?")}">importado</span>` : ""}</div>
          <div class="cx-meta">${escT([c.quando, cxCircuito(c.circuito), [c.ia, c.modelo].filter(Boolean).join(" · "), c.autor, cxTam(c.tamanho)].filter(Boolean).join("  ·  "))}
            ${(c.etiquetas || []).map((t) => `<span class="cx-tag">${escT(t)}</span>`).join("")}</div>
          ${cxLinhaIA(c)}
          <div class="cx-bts"><button data-a="usar" title="${usado ? "parar de usar nesta conversa" : "usar nesta conversa: a IA lê a nota e a conversa em todo pedido"}">${usado ? "em uso ✓" : "usar nesta conversa"}</button>
            <button data-a="abrir">abrir</button><button data-a="exportar" title="baixar o .pewctx para mandar a um colega">exportar</button><button data-a="apagar" class="cx-perigo">apagar</button></div></div>`;
      }).join("") : `<div class="cc-vazio">${L.contextos.length ? "nada com esse filtro" : "nenhum contexto salvo ainda: “salvar” na conversa guarda o primeiro"}</div>`;
    } else {
      const itens = L.anteriores.filter((c) => !f || [c.primeiro, c.circuito].join(" ").toLowerCase().includes(f));
      m.q(".cx-corpo").innerHTML = itens.length ? itens.map((c) => `<div class="cx-item" data-sid="${escT(c.id)}"><div class="cx-tit">${escT(c.primeiro || "(sem texto)")}</div>
          <div class="cx-meta">${escT([`${cxData(c.de)} → ${cxData(c.ate)}`, `${c.pedidos} pedido${c.pedidos === 1 ? "" : "s"}`, cxCircuito(c.circuito)].filter(Boolean).join("  ·  "))}</div>
          <div class="cx-bts"><button data-a="salvar-ant">salvar como contexto</button></div></div>`).join("") : `<div class="cc-vazio">nenhuma conversa anterior</div>`;
    }
  };
  m.fundo.querySelectorAll(".cx-abas [data-aba]").forEach((b) => { b.onclick = () => { cx.aba = b.dataset.aba; desenha(); }; });
  m.q(".cx-filtro").value = cx.filtro; m.q(".cx-filtro").oninput = (ev) => { cx.filtro = ev.target.value; desenha(); };
  m.q(".cx-importar").onclick = () => m.q(".cx-arq").click();
  m.q(".cx-arq").onchange = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
    try {
      const dados = await new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => erro(new Error("não deu para ler o arquivo")); r.readAsDataURL(f); });
      cx.lista = await apiClaude("contexto/importar", { nome: f.name, dados }); cx.aba = "salvos"; status(`importado: ${cx.lista.id}`);
    } catch (err) { status(err.message); }
    desenha();
  };
  m.q(".cx-corpo").onclick = async (ev) => {
    const b = ev.target.closest("button[data-a]"); if (!b) return;
    const item = b.closest(".cx-item"), id = item.dataset.id, a = b.dataset.a;
    const c = id && cx.lista.contextos.find((x) => x.id === id);
    try {
      if (a === "usar") {
        const usado = (cx.lista.usados || []).includes(id);
        const r = await apiClaude("contexto/usar", { id, usar: !usado });
        cc.estado = r; cx.lista = r.contextos_lista; desenhaChat(); desenha();
        status(usado ? "não está mais nesta conversa" : "em uso nesta conversa: a IA lê a partir do próximo pedido");
      } else if (a === "abrir") cxAbrir(id, async () => { await carrega(); });
      else if (a === "exportar") cxExportar(c);
      else if (a === "resumo-ia") { cx.lista = await apiClaude("contexto/resumo_ia", { id, modelo: $("cc-modelo").value, esforco: $("cc-esforco").value, ia: ccIA() }); desenha(); vigia(); }
      else if (a === "apagar") {
        if (!(await modal({ titulo: "Apagar o contexto?", texto: `“${c.titulo}” sai da biblioteca (e das conversas que o usam). Não tem volta — exporte antes, se quiser guardar.`, ok: "apagar", perigo: true }))) return;
        cx.lista = await apiClaude("contexto/apagar", { id }); cc.estado = await apiClaude("pedido"); desenhaChat(); desenha(); status("apagado");
      } else if (a === "salvar-ant") {
        const sid = item.dataset.sid, ant = cx.lista.anteriores.find((x) => x.id === sid);
        m.fecha(); cx.aba = "salvos"; cxSalvar(sid, (ant && ant.primeiro || "").slice(0, 80));
      }
    } catch (err) { status(err.message); }
  };
  desenha(); carrega();
}

// o resumo pela IA de um contexto, na biblioteca: gerando (o diodo animado), pronto, falhou (gerar de novo) ou pedir
function cxLinhaIA(c) {
  const r = c.resumo_ia || {};
  if (r.estado === "gerando") return `<div class="cx-ia-linha">${diodoIA(16)} resumo pela IA: gerando… <span class="cc-dica-t">(em segundo plano; pode fechar)</span></div>`;
  if (r.estado === "pronto") return `<div class="cx-ia-linha cx-ia-ok">resumo pela IA ✓ <span class="cc-dica-t">${escT([r.modelo, r.quando].filter(Boolean).join(" · "))} — em “abrir”</span></div>`;
  if (r.estado === "falhou") return `<div class="cx-ia-linha cx-ia-falhou">resumo pela IA: falhou <span class="cc-dica-t" title="${escT(r.erro || "")}">(${escT((r.erro || "").slice(0, 90))})</span> <button data-a="resumo-ia">gerar de novo</button></div>`;
  return c.tem && c.tem["conversa.md"] ? `<div class="cx-ia-linha"><button data-a="resumo-ia" title="em segundo plano: a IA lê a conversa guardada e escreve um resumo (não aparece na conversa; gasta uso)">resumo pela IA</button></div>` : "";
}

// abrir um contexto: a nota (formatada) e a conversa; editar o título, as etiquetas e a nota
async function cxAbrir(id, depois) {
  let c; try { c = await apiClaude(`contexto?id=${encodeURIComponent(id)}`); } catch (err) { cc.aviso = err.message; desenhaChat(); return; }
  const meta = c.meta;
  const m = cxModal("cx-abrir", `<h3>${escT(meta.titulo)}</h3>
    <div class="cx-ver cc-ele">${mdLeve(c.contexto)}</div>
    ${c.conversa ? `<details class="cx-conversa"><summary>a conversa (${((n) => `${n} pedido${n === 1 ? "" : "s"}`)((c.conversa.match(/^## \d+\. Pedido/gm) || []).length)})</summary><div class="cc-ele">${mdLeve(c.conversa)}</div></details>` : ""}
    <details class="cx-arqs"><summary>arquivos (${c.arquivos.length})</summary><div class="cc-dica-t">${c.arquivos.map((a) => `${escT(a.nome)} · ${cxTam(a.tamanho)}`).join("<br>")}</div></details>
    <div class="cx-editar" hidden><label class="cx-l">título <input class="cx-titulo" maxlength="200"></label><label class="cx-l">etiquetas <input class="cx-etiquetas"></label>
      <label class="cx-l">nota</label><textarea class="cx-resumo" spellcheck="false"></textarea></div>
    <div class="cx-status cc-dica-t"></div>
    <div class="modal-botoes"><button class="m-fechar">fechar</button><button class="m-editar">editar</button><button class="m-guardar primario" hidden>guardar</button></div>`);
  m.q(".m-fechar").onclick = m.fecha;
  m.q(".m-editar").onclick = async () => {
    m.q(".cx-editar").hidden = false; m.q(".m-guardar").hidden = false; m.q(".m-editar").hidden = true;
    m.q(".cx-titulo").value = meta.titulo; m.q(".cx-etiquetas").value = (meta.etiquetas || []).join(", ");
    m.q(".cx-resumo").value = c.resumo || "";
  };
  m.q(".m-guardar").onclick = async () => {
    try {
      await apiClaude("contexto/mudar", { id, titulo: m.q(".cx-titulo").value, etiquetas: m.q(".cx-etiquetas").value.split(/[,;]/), resumo: m.q(".cx-resumo").value });
      m.fecha(); if (depois) depois();
    } catch (err) { m.q(".cx-status").textContent = err.message; }
  };
}

// exportar: mostra o que vai (a conversa pode ter informação pessoal) e baixa o .pewctx
async function cxExportar(c) {
  let d; try { d = await apiClaude(`contexto?id=${encodeURIComponent(c.id)}`); } catch (err) { cc.aviso = err.message; return; }
  const temAnexos = d.arquivos.some((a) => a.nome.startsWith("anexos/"));
  const m = cxModal("cx-exportar", `<h3>Exportar “${escT(c.titulo)}”</h3>
    <p class="cc-dica-t">Vai um arquivo .pewctx para mandar a um colega do time. Confira o que vai — a conversa inteira vai junto.</p>
    <div class="cc-dica-t cx-lista-arq">${d.arquivos.map((a) => `<div data-anexo="${a.nome.startsWith("anexos/") ? 1 : 0}">${escT(a.nome)} · ${cxTam(a.tamanho)}</div>`).join("")}</div>
    ${temAnexos ? `<label><input type="checkbox" class="cx-com-anexos" checked> com os anexos</label>` : ""}
    <div class="modal-botoes"><button class="m-fechar">cancelar</button><button class="m-guardar primario">baixar .pewctx</button></div>`);
  m.q(".m-fechar").onclick = m.fecha;
  if (m.q(".cx-com-anexos")) m.q(".cx-com-anexos").onchange = (ev) => m.fundo.querySelectorAll('[data-anexo="1"]').forEach((x) => { x.style.textDecoration = ev.target.checked ? "" : "line-through"; });
  m.q(".m-guardar").onclick = async () => {
    const anexos = !m.q(".cx-com-anexos") || m.q(".cx-com-anexos").checked;
    const r = await fetch(`claude/contexto/exportar?id=${encodeURIComponent(c.id)}&anexos=${anexos ? 1 : 0}`);
    if (!r.ok) { m.q(".cc-dica-t").textContent = ((await r.json().catch(() => ({}))).erro) || r.statusText; return; }
    const url = URL.createObjectURL(await r.blob()), a = document.createElement("a");
    a.href = url; a.download = `${c.id}.pewctx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    m.fecha();
  };
}

// as etiquetas dos contextos em uso, ao lado dos anexos (o × tira da conversa)
function cxEtiquetas() {
  const usados = ((cc.estado || {}).conversa || {}).contextos || [];
  return usados.map((u) => `<span class="cc-anexo cx-em-uso" title="contexto salvo em uso nesta conversa: a IA lê a nota e a conversa em todo pedido"><span class="cx-livro">📘</span><span>${escT(u.titulo)}</span><button data-ctx-tira="${escT(u.id)}" title="parar de usar nesta conversa">×</button></span>`).join("");
}
(() => {
  $("cc-salvar").onclick = () => cxSalvar();
  $("cc-contextos").onclick = cxBiblioteca;
  $("ctl-claude").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-ctx-tira]"); if (!b) return;
    try { const r = await apiClaude("contexto/usar", { id: b.dataset.ctxTira, usar: false }); cc.estado = r; } catch (e) { cc.aviso = e.message; }
    desenhaChat();
  });
})();
