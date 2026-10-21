import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// A página inicial (index.html, o menu public/maisim-nav.js) e os módulos do MaiSim encaminhados por aqui, para tudo ficar numa porta só:
//   /maisim/simu   → monte e simule circuitos, com o Gecko como cérebro (simu/servidor.py, MAISIM_PORTA_SIMU)
//   /maisim/scope  → o scope (scope/servidor.py, MAISIM_PORTA_SCOPE)
//   /maisim/gecko  → a tela do GeckoCIRCUITS no navegador: noVNC + websockify (MAISIM_PORTA_TELA) sobre um Xvfb com o Gecko
//                    (gecko/sobe.sh); o websocket do VNC passa por aqui também (ws: true)
// As portas vêm de config/ (padrao.env, o perfil de MAISIM_PERFIL, o .env da raiz e o ambiente), pelo mesmo leitor dos
// servidores (config/ler_config.py).
const CFG = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('../config/ler_config.py', import.meta.url)), '--json']).toString())
const local = (porta) => `http://localhost:${CFG[porta]}`
// a ponte Windows ↔ WSL às vezes deixa morta, do lado do Windows, uma conexão que o navegador guardou para reusar: o GET o
// Chrome repete sozinho numa conexão nova, o POST não ("Failed to fetch" em toda mudança). Fechar a conexão depois de cada
// resposta do simu e do scope tira o reuso (no localhost, abrir uma conexão nova custa quase nada)
const fecha = (proxy) => proxy.on('proxyRes', (proxyRes) => { proxyRes.headers.connection = 'close' })
const proxy = {
    '/maisim/scope': { target: local('MAISIM_PORTA_SCOPE'), changeOrigin: true, configure: fecha },
    '/maisim/simu': { target: local('MAISIM_PORTA_SIMU'), changeOrigin: true, configure: fecha },
    '/maisim/gecko': { target: local('MAISIM_PORTA_TELA'), changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/maisim\/gecko/, '') },
}

// e o mesmo para o que o próprio Vite serve (o trilho /maisim-nav.js, a página inicial): o trilho sumiu numa queda dessas (18/10;
// a página do simu segue sem ele quando o script não carrega)
const conexaoFechada = {
    name: 'maisim-conexao-fechada',
    configureServer: (server) => { server.middlewares.use((req, res, next) => { res.setHeader('Connection', 'close'); next() }) },
    configurePreviewServer: (server) => { server.middlewares.use((req, res, next) => { res.setHeader('Connection', 'close'); next() }) },
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [conexaoFechada],
    server: {
        port: Number(CFG.MAISIM_PORTA_PAGINA),
        strictPort: true,
        proxy,
    },
    preview: { proxy },
})
