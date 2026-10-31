// o circuito novo (sem arquivo) no título automático da seção do scope troca com o idioma (página de teste 7200 → simu 7201,
// scope 7202), apontado pelo Codex no #178: o título "novo (sem arquivo)" ficava no idioma em que nasceu. Grava uma rodada de
// um circuito novo, abre o scope sem layout guardado (o automático) em português e troca para inglês
const { chromium } = require("playwright");
const B = "http://localhost:7200", S = "http://localhost:7201/maisim/simu/";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const api = async (rota, corpo) => (await fetch(S + rota, { method: corpo ? "POST" : "GET", headers: { "Content-Type": "application/json", Cookie: "maisim-lingua=pt" },
  body: corpo ? JSON.stringify(corpo) : undefined })).json();
(async () => {
  let b;
  try {
    // uma rodada de um circuito novo: 12 V num resistor, com um amperímetro
    await api("editor/novo", { modo: "descartar" });
    const cmd = (op, ...args) => api("editor/cmd", { op, args });
    await cmd("CREATE", "U.1", 4, 10, "U"); await cmd("CREATE", "R.1", 10, 10, "R");
    await api("editor/fio", { acao: "novo", cantos: [[4, 8], [4, 6], [10, 6], [10, 8]], dom: "LK", rotulo: "" });
    await api("editor/fio", { acao: "novo", cantos: [[4, 12], [4, 14], [10, 14], [10, 12]], dom: "LK", rotulo: "" });
    await cmd("CREATE", "AMP.1", 16, 10, "AMP"); await cmd("OUTNODE", "AMP.1", 0, "i_R1");
    await api("editor/mede", { nome: "AMP.1", tipo: "I", componente: "R.1" });
    let j = await api("editor/rodar", { dt: "1e-6", tfim: "1e-4", amostras: "100", nome: "novo_lingua" });
    while (["preparando", "rodando", "pausada"].includes(j.estado)) { await new Promise((r) => setTimeout(r, 300)); j = await api("editor/rodada"); }
    ok(!!j.arquivo, `a rodada do circuito novo: ${j.arquivo}`);
    b = await chromium.launch();
    const pg = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: "pt-BR" })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto(`${B}/maisim/scope/?a=${encodeURIComponent(j.arquivo)}`);
    await pg.waitForFunction(() => document.querySelectorAll(".secao .titulo-secao").length > 0, null, { timeout: 20000 });
    const titulo = () => pg.evaluate(() => document.querySelector(".secao .titulo-secao").value);
    const pt = await titulo();
    ok(pt === "novo (sem arquivo)", `em português, a seção automática: "${pt}"`);
    await pg.evaluate(() => window.maisimI18n.muda("en")); await pg.waitForTimeout(600);
    const en = await titulo();
    ok(en === "new (no file)", `trocando para inglês, a mesma seção: "${en}"`);
    await pg.evaluate(() => window.maisimI18n.muda("pt")); await pg.waitForTimeout(400);
    ok(await titulo() === "novo (sem arquivo)", "e de volta ao português");
    ok(!erros.length, `sem erros na página ${erros.join(" | ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message.split("\n")[0]); }
  finally { if (b) await b.close(); }
  console.log(`\n${falhas ? falhas + " falha(s)" : "tudo certo"}`);
  process.exit(falhas ? 1 : 0);
})();
