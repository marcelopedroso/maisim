// a versão no trilho e a janela da atualização (instância de teste 7200 → 7201; as releases de mentira do config/teste.env):
// "v0.3.0" sob a marca, com o ponto da release nova; a dica "MaiSim 0.3.0 · código-fonte"; o clique abre a janela com a
// 9.9.0, as notas em markdown (sem o link javascript: e sem a imagem), o "git pull" (a versão de programador não baixa), o
// canal teste (a 9.9.1-rc1) e de volta; Depois fecha; em inglês; e a versão no "Sobre e créditos" da página inicial
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const V = fs.readFileSync(path.join(__dirname, "../../../VERSION"), "utf8").trim();
const post = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(`/maisim/simu/atualizacao/${r}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) }).then((x) => x.json()), [rota, corpo]);
(async () => {
  let b, pg;
  try {
    b = await chromium.launch(); pg = await (await b.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#maisim-nav");
    await post(pg, "canal", { canal: "estavel" }); await post(pg, "verificar", {});
    await pg.evaluate(() => window.maisimNav.situacaoVersao());
    await pg.waitForSelector("#maisim-nav .versao:not([hidden])", { timeout: 10000 });
    const r = await pg.evaluate(() => { const v = document.querySelector("#maisim-nav .versao"), m = document.querySelector("#maisim-nav .marca").getBoundingClientRect(), c = v.getBoundingClientRect();
      return { txt: v.textContent, nova: v.classList.contains("novidade"), ponto: getComputedStyle(v.querySelector(".ponto")).display, abaixo: c.top >= m.bottom - 9 && c.bottom < m.bottom + 30, larg: c.width }; });
    ok(r.txt === `v${V}` && r.nova && r.ponto === "block" && r.abaixo && r.larg <= 52, `sob a marca: "${r.txt}", com o ponto (${r.ponto}), ${Math.round(r.larg)} px`);
    await pg.hover("#maisim-nav .versao"); await pg.waitForTimeout(700);
    const dica = await pg.evaluate(() => document.getElementById("dica-ui") && document.getElementById("dica-ui").textContent);
    ok(dica && dica.includes(`MaiSim ${V} · código-fonte`) && dica.includes("9.9.0"), `a dica do MaiSim: "${(dica || "").replace(/\n/g, " / ")}"`);
    await pg.click("#maisim-nav .versao"); await pg.waitForSelector("#maisim-atu .notas strong", { timeout: 10000 });
    const j = await pg.evaluate(() => { const q = (s) => document.querySelector(`#maisim-atu ${s}`);
      const links = [...document.querySelectorAll("#maisim-atu .notas a")].map((a) => [a.textContent, a.getAttribute("href"), a.target]);
      return { h2: q("h2").textContent, sub: q(".sub").textContent, forte: q(".notas strong").textContent, links, img: !!q(".notas img"), fonte: q(".fonte").hidden ? "" : q(".fonte").textContent,
        atualizar: q(".atualizar").hidden, canal: q("select").value, github: q(".github").href }; });
    ok(j.h2 === "MaiSim 9.9.0 disponível" && j.sub.includes(V) && j.forte === "nova", `a janela: "${j.h2}" · "${j.sub}" · as notas em markdown`);
    ok(j.links.some((l) => l[0] === "as notas" && /^https:/.test(l[1]) && l[2] === "_blank") && j.links.some((l) => l[0] === "link ruim" && l[1] === null) && !j.img,
       `as notas seguras: o link https numa aba nova, o javascript: sem href, sem a imagem (${JSON.stringify(j.links)})`);
    ok(/git pull/.test(j.fonte) && j.atualizar && j.canal === "estavel" && /releases\/tag\/v9\.9\.0$/.test(j.github), `a versão de programador: "${j.fonte}" (sem o Atualizar); canal ${j.canal}`);
    await pg.selectOption("#maisim-atu select", "teste");
    await pg.waitForFunction(() => /9\.9\.1-rc1/.test(document.querySelector("#maisim-atu h2").textContent), null, { timeout: 8000 }).catch(() => {});
    const h2t = await pg.textContent("#maisim-atu h2");
    await pg.selectOption("#maisim-atu select", "estavel");
    await pg.waitForFunction(() => /9\.9\.0/.test(document.querySelector("#maisim-atu h2").textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/9\.9\.1-rc1/.test(h2t) && /9\.9\.0/.test(await pg.textContent("#maisim-atu h2")), `o canal teste: "${h2t}"; de volta ao estável`);
    await pg.click("#maisim-atu .depois");
    ok(!(await pg.$("#maisim-atu")), "Depois fecha a janela");
    // no "Sobre e créditos" da página inicial
    await pg.click("#bt-creditos"); await pg.waitForFunction(() => /MaiSim/.test(document.getElementById("sobre-versao").textContent), null, { timeout: 8000 }).catch(() => {});
    const sobre = await pg.textContent("#sobre-versao");
    ok(sobre.includes(`MaiSim ${V} · código-fonte`) && sobre.includes("9.9.0"), `no Sobre e créditos: "${sobre}"`);
    await pg.click("#sobre-versao a"); ok(!!(await pg.waitForSelector("#maisim-atu", { timeout: 5000 }).catch(() => null)), "o link de lá abre a janela da atualização");
    await pg.keyboard.press("Escape");
    // em inglês (o trilho numa página do simu)
    await pg.goto("http://localhost:7200/maisim/scope/"); await pg.waitForSelector("#maisim-nav .versao:not([hidden])", { timeout: 15000 });
    await pg.evaluate(() => window.maisimI18n.muda("en")); await pg.waitForTimeout(500);
    const tEn = await pg.getAttribute("#maisim-nav .versao", "aria-label");
    await pg.click("#maisim-nav .versao"); await pg.waitForSelector("#maisim-atu h2");
    await pg.waitForFunction(() => /available/.test(document.querySelector("#maisim-atu h2").textContent), null, { timeout: 8000 }).catch(() => {});
    const en = await pg.evaluate(() => ({ h2: document.querySelector("#maisim-atu h2").textContent, dep: document.querySelector("#maisim-atu .depois").textContent, f: document.querySelector("#maisim-atu .fonte").textContent }));
    ok(/source code/.test(tEn) && en.h2 === "MaiSim 9.9.0 available" && en.dep === "Later" && /developer version/.test(en.f), `em inglês: "${tEn.replace(/\n/g, " / ")}" · "${en.h2}" · ${en.dep}`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (pg) { await post(pg, "canal", { canal: "estavel" }).catch(() => {}); await pg.evaluate(() => window.maisimI18n.muda("pt")).catch(() => {}); } if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
