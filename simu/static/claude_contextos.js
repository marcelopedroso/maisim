// MaiSim / simu — os contextos salvos (Marcelo, 21/10: "um botãozinho para salvar isso na memória não volátil… usar em outras
// conversas"; servidor: contextos.py e as rotas claude/contexto*). "salvar": a conversa vira um contexto (a nota de quem
// salva — "a pessoa escreve o que acha importante", sem resumo pela IA —, a conversa, o controle e a rodada daquele
// momento); "contextos": a biblioteca — usar nesta
// conversa (a IA lê a nota e a conversa em todo pedido), abrir, editar, exportar (.maisimctx), importar e apagar — e as conversas
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
const CX_DATA = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
const cxData = (q) => (typeof q === "number" ? maisimI18n.data(q * 1000, CX_DATA) : String(q || ""));
const cxTam = (b) => (b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
const cxCircuito = (c) => String(c || "").split("/").pop().replace(/\.ipes$/, "");

// ---- salvar a conversa (a aberta, ou uma anterior: sid) como contexto; exportar: salva e já baixa o .maisimctx (o "exportar"
// do topo da conversa). Com um contexto em uso, "juntar com o contexto em uso" (Marcelo, 21/10): um contexto NOVO que continua
// daquele — as duas conversas em ordem, um resumo só pela IA, o controle e a rodada de agora; o antigo fica como está
async function cxSalvar(sid = null, tituloSugerido = "", exportar = false) {
  const e = cc.estado || {}, conv = e.conversa || {}, atual = !sid;
  const hist = atual ? conv.historico || [] : [];
  const juntaveis = atual && hist.length ? (conv.contextos || []).filter((u) => !u.desta) : [];   // desta: salvo desta conversa (já está nele)
  const titulo = tituloSugerido || `${cxCircuito(conv.circuito) || tr("cx.conversa")} ${maisimI18n.data(new Date(), CX_DATA)}`;   // só a sugestão (a pessoa edita)
  const ultimo = juntaveis[juntaveis.length - 1];
  const m = cxModal("cx-salvar", `<h3>${escT(exportar ? tr("cx.t_exportar") : atual ? tr("cx.t_salvar_esta") : tr("cx.t_salvar_ant"))}</h3>
    <p class="cc-dica-t">${escT(exportar ? tr("cx.dica_exportar")
      : tr("cx.dica_salvar"))}</p>
    ${juntaveis.length ? `<div class="cx-junta"><label><input type="checkbox" class="cx-juntar" checked> ${escT(tr("cx.juntar"))}</label>
      ${juntaveis.length > 1 ? `<select class="cx-junta-com">${juntaveis.map((u) => `<option value="${escT(u.id)}"${u === ultimo ? " selected" : ""}>${escT(u.titulo)}</option>`).join("")}</select>`
        : `<b class="cx-junta-tit">${escT(ultimo.titulo)}</b>`}
      <div class="cc-dica-t">${escT(tr("cx.dica_juntar"))}</div></div>` : ""}
    <label class="cx-l">${escT(tr("cx.titulo"))} <input class="cx-titulo" maxlength="200"></label>
    <label class="cx-l">${escT(tr("cx.etiquetas"))} <input class="cx-etiquetas" placeholder="${escT(tr("cx.ph_etiquetas"))}"></label>
    <div class="cx-inclui">${escT(tr("cx.incluir"))} <label><input type="checkbox" class="cx-i" data-k="conversa" checked> ${escT(tr("cx.i_conversa"))}</label>
      <label title="${escT(atual ? tr("cx.t_i_controle_atual") : tr("cx.t_i_controle_ant"))}"><input type="checkbox" class="cx-i" data-k="controle" checked> ${escT(tr("cx.i_controle"))}</label>
      ${atual ? `<label title="${escT(tr("cx.t_i_rodada"))}"><input type="checkbox" class="cx-i" data-k="rodada" checked> ${escT(tr("cx.i_rodada"))}</label>` : ""}
      <label title="${escT((conv.anexos || []).map((a) => a.nome).join(", ") || tr("cx.sem_anexos"))}"><input type="checkbox" class="cx-i" data-k="anexos"${!atual || (conv.anexos || []).length ? "" : " disabled"}> ${escT(tr("cx.i_anexos"))}</label></div>
    <div class="cx-res-cab"><b>${escT(tr("cx.nota"))}</b> <span class="cc-dica-t">${escT(tr("cx.dica_nota"))}</span>
      <label class="cx-ia" title="${escT(tr("cx.t_resumo_ia"))}"><input type="checkbox" class="cx-resumo-ia"${(atual ? hist.length : 1) ? "" : " disabled"}> ${escT(tr("cx.resumo_ia_depois"))}</label></div>
    <textarea class="cx-resumo" spellcheck="false" placeholder="${escT(tr("cx.ph_nota"))}"></textarea>
    <div class="cx-status cc-dica-t"></div>
    <div class="modal-botoes"><button class="m-fechar">${escT(tr("cc.cancelar"))}</button><button class="m-guardar primario">${escT(exportar ? tr("cx.salvar_baixar") : tr("cc.guardar"))}</button></div>`);
  m.q(".cx-titulo").value = titulo; m.q(".cx-titulo").select(); m.q(".cx-titulo").focus();
  m.q(".m-fechar").onclick = m.fecha;
  const status = (t) => { m.q(".cx-status").textContent = t; };
  const juntaCom = () => (m.q(".cx-juntar") && m.q(".cx-juntar").checked ? (m.q(".cx-junta-com") ? m.q(".cx-junta-com").value : ultimo.id) : "");
  const marcaJunta = () => {                           // juntando: a conversa e o resumo pela IA vão sempre (o resumo único é a junção)
    const j = !!juntaCom();
    for (const s of ['.cx-i[data-k="conversa"]', ".cx-resumo-ia"]) { const c = m.q(s); if (j) c.checked = true; c.disabled = j || (s === ".cx-resumo-ia" && !(atual ? hist.length : 1)); }
    if (m.q(".cx-junta-com")) m.q(".cx-junta-com").disabled = !j;
  };
  if (m.q(".cx-juntar")) { m.q(".cx-juntar").onchange = marcaJunta; marcaJunta(); }
  m.q(".m-guardar").onclick = async () => {
    const incluir = {}; m.fundo.querySelectorAll(".cx-i").forEach((c) => { incluir[c.dataset.k] = c.checked; });
    const juntar = juntaCom(), tituloJunta = juntar ? (juntaveis.find((u) => u.id === juntar) || {}).titulo : "";
    let r, ia;
    try {
      ia = !!juntar || (m.q(".cx-resumo-ia").checked && incluir.conversa);
      r = await apiClaude("contexto/salvar", { conversa: sid || undefined, titulo: m.q(".cx-titulo").value, etiquetas: m.q(".cx-etiquetas").value,
        resumo: m.q(".cx-resumo").value, incluir, resumo_ia: ia, juntar: juntar || undefined, modelo: $("cc-modelo").value, esforco: $("cc-esforco").value, ia: ccIA() });
    } catch (err) { status(err.message); return; }
    cx.lista = r;
    const tit0 = m.q(".cx-titulo").value || r.id, tit = juntar ? tr("cx.tit_continua", { tit: tit0, de: tituloJunta }) : tit0;
    const avisa = (t) => { cc.aviso = ""; cc.avisoOk = t; desenhaChat(); setTimeout(() => { if (cc.avisoOk === t) { cc.avisoOk = ""; desenhaChat(); } }, 8000); };
    if (!exportar) { m.fecha(); avisa(tr(ia ? "cx.salvo_ia" : "cx.salvo", { tit })); return; }
    // exportar: com o resumo pela IA, espera ele ficar pronto (o .maisimctx vai com ele) — ou "baixar sem esperar"
    m.fundo.querySelectorAll("input, textarea, select").forEach((x) => { x.disabled = true; });
    m.q(".m-guardar").disabled = true; m.q(".m-fechar").textContent = tr("cx.fechar_salvo");
    let estado = "";
    if (ia) {
      let ja = false;
      m.q(".cx-status").innerHTML = `<span class="cx-espera">${diodoIA(16)} ${escT(tr("cx.escrevendo"))} <button class="cx-ja">${escT(tr("cx.baixar_ja"))}</button></span>`;
      m.q(".cx-ja").onclick = () => { ja = true; };
      for (;;) {
        if (!document.body.contains(m.fundo)) return;  // fechou: o contexto fica salvo (exporte depois, pela biblioteca)
        try { estado = ((await apiClaude(`contexto?id=${encodeURIComponent(r.id)}`)).meta.resumo_ia || {}).estado || ""; } catch (err) { estado = "falhou"; }
        if (ja || estado !== "gerando") break;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    }
    try { await cxBaixa(r.id); } catch (err) { status(tr("cx.nao_baixou", { erro: err.message })); m.q(".m-fechar").textContent = tr("cc.fechar"); return; }
    m.fecha();
    avisa(tr(!ia ? "cx.exportado" : estado === "pronto" ? "cx.exportado_ia" : estado === "falhou" ? "cx.exportado_falhou" : "cx.exportado_gerando", { tit }));
  };
}

// baixa o .maisimctx de um contexto salvo
async function cxBaixa(id, anexos = true) {
  const r = await fetch(`claude/contexto/exportar?id=${encodeURIComponent(id)}&anexos=${anexos ? 1 : 0}`);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).erro) || r.statusText);
  const url = URL.createObjectURL(await r.blob()), a = document.createElement("a");
  a.href = url; a.download = `${id}.maisimctx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- a biblioteca
async function cxBiblioteca() {
  const m = cxModal("cx-bib", `<h3>${escT(tr("cc.contextos"))}</h3>
    <div class="cx-abas"><button data-aba="salvos">${escT(tr("cx.aba_salvos"))}</button><button data-aba="anteriores" title="${escT(tr("cx.t_aba_ant"))}">${escT(tr("cx.aba_ant"))}</button>
      <input class="cx-filtro" placeholder="${escT(tr("cx.ph_filtro"))}"><button class="cx-importar" title="${escT(tr("cx.t_importar"))}">${escT(tr("cx.importar"))}</button>
      <input type="file" class="cx-arq" accept=".maisimctx,.pewctx,.zip" hidden></div>
    <div class="cx-corpo"></div><div class="cx-status cc-dica-t"></div>
    <div class="modal-botoes"><button class="m-fechar">${escT(tr("cc.fechar"))}</button></div>`);
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
        return `<div class="cx-item${usado ? " usado" : ""}" data-id="${escT(c.id)}"><div class="cx-tit">${escT(c.titulo)}${c.importado ? ` <span class="cx-imp" title="${escT(tr("cx.t_importado", { autor: c.importado.autor_original || "?" }))}">${escT(tr("cx.importado"))}</span>` : ""}</div>
          <div class="cx-meta">${escT([c.quando, cxCircuito(c.circuito), [c.ia, c.modelo].filter(Boolean).join(" · "), c.autor, cxTam(c.tamanho),
            c.continua_de ? tr("cx.continua_de", { tit: c.continua_de.titulo }) : ""].filter(Boolean).join("  ·  "))}
            ${(c.etiquetas || []).map((t) => `<span class="cx-tag">${escT(t)}</span>`).join("")}</div>
          ${cxLinhaIA(c)}
          <div class="cx-bts"><button data-a="usar" title="${escT(usado ? tr("cx.t_parar_usar") : tr("cx.t_usar"))}">${escT(usado ? tr("cx.em_uso") : tr("cx.usar"))}</button>
            <button data-a="abrir">${escT(tr("cx.abrir"))}</button><button data-a="exportar" title="${escT(tr("cx.t_exportar_item"))}">${escT(tr("cc.exportar"))}</button><button data-a="apagar" class="cx-perigo">${escT(tr("cx.apagar"))}</button></div></div>`;
      }).join("") : `<div class="cc-vazio">${escT(L.contextos.length ? tr("cx.nada_filtro") : tr("cx.nenhum"))}</div>`;
    } else {
      const itens = L.anteriores.filter((c) => !f || [c.primeiro, c.circuito].join(" ").toLowerCase().includes(f));
      m.q(".cx-corpo").innerHTML = itens.length ? itens.map((c) => `<div class="cx-item" data-sid="${escT(c.id)}"><div class="cx-tit">${escT(c.primeiro || tr("cx.sem_texto"))}</div>
          <div class="cx-meta">${escT([`${cxData(c.de)} → ${cxData(c.ate)}`, tr("cx.n_pedidos", { n: c.pedidos }), cxCircuito(c.circuito)].filter(Boolean).join("  ·  "))}</div>
          <div class="cx-bts"><button data-a="salvar-ant">${escT(tr("cx.salvar_como"))}</button></div></div>`).join("") : `<div class="cc-vazio">${escT(tr("cx.nenhuma_ant"))}</div>`;
    }
  };
  m.fundo.querySelectorAll(".cx-abas [data-aba]").forEach((b) => { b.onclick = () => { cx.aba = b.dataset.aba; desenha(); }; });
  m.q(".cx-filtro").value = cx.filtro; m.q(".cx-filtro").oninput = (ev) => { cx.filtro = ev.target.value; desenha(); };
  m.q(".cx-importar").onclick = () => m.q(".cx-arq").click();
  m.q(".cx-arq").onchange = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
    try {
      const dados = await new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => erro(new Error(tr("cx.nao_leu"))); r.readAsDataURL(f); });
      cx.lista = await apiClaude("contexto/importar", { nome: f.name, dados }); cx.aba = "salvos"; status(tr("cx.importado_id", { id: cx.lista.id }));
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
        status(usado ? tr("cx.nao_usado") : tr("cx.em_uso_status"));
      } else if (a === "abrir") cxAbrir(id, async () => { await carrega(); });
      else if (a === "exportar") cxExportar(c);
      else if (a === "resumo-ia") { cx.lista = await apiClaude("contexto/resumo_ia", { id, modelo: $("cc-modelo").value, esforco: $("cc-esforco").value, ia: ccIA() }); desenha(); vigia(); }
      else if (a === "apagar") {
        if (!(await modal({ titulo: tr("cx.apagar_titulo"), texto: tr("cx.apagar_texto", { tit: c.titulo }), ok: tr("cx.apagar"), perigo: true }))) return;
        cx.lista = await apiClaude("contexto/apagar", { id }); cc.estado = await apiClaude("pedido"); desenhaChat(); desenha(); status(tr("cx.apagado"));
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
  if (r.estado === "gerando") return `<div class="cx-ia-linha">${diodoIA(16)} ${escT(tr("cx.ia_gerando"))} <span class="cc-dica-t">${escT(tr("cx.ia_fundo"))}</span></div>`;
  if (r.estado === "pronto") return `<div class="cx-ia-linha cx-ia-ok">${escT(tr("cx.ia_pronto"))} <span class="cc-dica-t">${escT(tr("cx.ia_em_abrir", { info: [r.modelo, r.quando].filter(Boolean).join(" · ") }))}</span></div>`;
  if (r.estado === "falhou") return `<div class="cx-ia-linha cx-ia-falhou">${escT(tr("cx.ia_falhou"))} <span class="cc-dica-t" title="${escT(r.erro || "")}">(${escT((r.erro || "").slice(0, 90))})</span> <button data-a="resumo-ia">${escT(tr("cx.gerar_de_novo"))}</button></div>`;
  return c.tem && c.tem["conversa.md"] ? `<div class="cx-ia-linha"><button data-a="resumo-ia" title="${escT(tr("cx.t_resumo_ia_bt"))}">${escT(tr("cx.resumo_ia"))}</button></div>` : "";
}

// abrir um contexto: a nota (formatada) e a conversa; editar o título, as etiquetas e a nota
async function cxAbrir(id, depois) {
  let c; try { c = await apiClaude(`contexto?id=${encodeURIComponent(id)}`); } catch (err) { cc.aviso = err.message; desenhaChat(); return; }
  const meta = c.meta;
  const m = cxModal("cx-abrir", `<h3>${escT(meta.titulo)}</h3>
    <div class="cx-ver cc-ele">${mdLeve(c.contexto)}</div>
    ${c.conversa ? `<details class="cx-conversa"><summary>${escT(tr("cx.a_conversa", { n: (c.conversa.match(/^## \d+\. (?:Pedido|Request)/gm) || []).length }))}</summary><div class="cc-ele">${mdLeve(c.conversa)}</div></details>` : ""}
    <details class="cx-arqs"><summary>${escT(tr("cx.arquivos_n", { n: c.arquivos.length }))}</summary><div class="cc-dica-t">${c.arquivos.map((a) => `${escT(a.nome)} · ${cxTam(a.tamanho)}`).join("<br>")}</div></details>
    <div class="cx-editar" hidden><label class="cx-l">${escT(tr("cx.titulo"))} <input class="cx-titulo" maxlength="200"></label><label class="cx-l">${escT(tr("cx.etiquetas"))} <input class="cx-etiquetas"></label>
      <label class="cx-l">${escT(tr("cx.nota_l"))}</label><textarea class="cx-resumo" spellcheck="false"></textarea></div>
    <div class="cx-status cc-dica-t"></div>
    <div class="modal-botoes"><button class="m-fechar">${escT(tr("cc.fechar"))}</button><button class="m-editar">${escT(tr("cx.editar"))}</button><button class="m-guardar primario" hidden>${escT(tr("cc.guardar"))}</button></div>`);
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

// exportar: mostra o que vai (a conversa pode ter informação pessoal) e baixa o .maisimctx
async function cxExportar(c) {
  let d; try { d = await apiClaude(`contexto?id=${encodeURIComponent(c.id)}`); } catch (err) { cc.aviso = err.message; return; }
  const temAnexos = d.arquivos.some((a) => a.nome.startsWith("anexos/"));
  const m = cxModal("cx-exportar", `<h3>${escT(tr("cx.exportar_tit", { tit: c.titulo }))}</h3>
    <p class="cc-dica-t">${escT(tr("cx.dica_exportar_item"))}</p>
    <div class="cc-dica-t cx-lista-arq">${d.arquivos.map((a) => `<div data-anexo="${a.nome.startsWith("anexos/") ? 1 : 0}">${escT(a.nome)} · ${cxTam(a.tamanho)}</div>`).join("")}</div>
    ${temAnexos ? `<label><input type="checkbox" class="cx-com-anexos" checked> ${escT(tr("cx.com_anexos"))}</label>` : ""}
    <div class="modal-botoes"><button class="m-fechar">${escT(tr("cc.cancelar"))}</button><button class="m-guardar primario">${escT(tr("cx.baixar"))}</button></div>`);
  m.q(".m-fechar").onclick = m.fecha;
  if (m.q(".cx-com-anexos")) m.q(".cx-com-anexos").onchange = (ev) => m.fundo.querySelectorAll('[data-anexo="1"]').forEach((x) => { x.style.textDecoration = ev.target.checked ? "" : "line-through"; });
  m.q(".m-guardar").onclick = async () => {
    try { await cxBaixa(c.id, !m.q(".cx-com-anexos") || m.q(".cx-com-anexos").checked); } catch (err) { m.q(".cc-dica-t").textContent = err.message; return; }
    m.fecha();
  };
}

// as etiquetas dos contextos em uso, ao lado dos anexos (o × tira da conversa). Trocar o idioma: o desenhaChat() as refaz (o
// aoMudar do claude_chat.js); as janelas deste arquivo (salvar, a biblioteca, abrir, exportar) saem no idioma de quando abriram
function cxEtiquetas() {
  const usados = ((cc.estado || {}).conversa || {}).contextos || [];
  return usados.map((u) => `<span class="cc-anexo cx-em-uso" title="${escT(tr("cx.t_em_uso"))}"><span class="cx-livro">📘</span><span>${escT(u.titulo)}</span><button data-ctx-tira="${escT(u.id)}" title="${escT(tr("cx.t_parar_usar"))}">×</button></span>`).join("");
}
(() => {
  $("cc-salvar").onclick = () => cxSalvar();
  $("cc-exportar").onclick = () => cxSalvar(null, "", true);
  $("cc-contextos").onclick = cxBiblioteca;
  $("ctl-claude").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-ctx-tira]"); if (!b) return;
    try { const r = await apiClaude("contexto/usar", { id: b.dataset.ctxTira, usar: false }); cc.estado = r; } catch (e) { cc.aviso = e.message; }
    desenhaChat();
  });
})();
