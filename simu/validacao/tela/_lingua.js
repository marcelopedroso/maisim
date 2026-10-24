// os testes de tela em português (o MaiSim em português e inglês, 24/10/2026): carregado antes de cada teste
// (NODE_OPTIONS="--require …/tela/_lingua.js", no ci.sh e no bateria.sh). Todo navegador que o teste abre ganha o locale
// pt-BR e o maisim-lingua = pt guardado — os testes conferem os textos em português, e a máquina do GitHub se apresenta em
// inglês. MAISIM_TESTE_LINGUA=en roda o mesmo teste em inglês (para os testes do idioma).
const L = process.env.MAISIM_TESTE_LINGUA === "en" ? "en" : "pt";
const LOCALE = L === "en" ? "en-US" : "pt-BR";
let pw;
try { pw = require("playwright"); } catch (e) { pw = null; console.error(`_lingua.js: sem o playwright (${e.message}); o teste roda sem fixar o idioma`); }
if (pw && pw.chromium && !pw.chromium.__lingua) {
  const fixa = (ctx) => ctx.addInitScript((l) => { try { if (!localStorage.getItem("maisim-lingua")) localStorage.setItem("maisim-lingua", l); } catch (e) { /* ok */ } }, L).then(() => ctx);
  const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...a) => {
    const b = await launch(...a);
    const novoCtx = b.newContext.bind(b), novaPag = b.newPage.bind(b);
    b.newContext = async (o = {}) => fixa(await novoCtx({ locale: LOCALE, ...o }));
    b.newPage = async (o = {}) => { const ctx = await b.newContext(o); const pg = await ctx.newPage(); pg.close = async (...x) => { await ctx.close(...x); }; return pg; };
    return b;
  };
  pw.chromium.__lingua = L;
}
