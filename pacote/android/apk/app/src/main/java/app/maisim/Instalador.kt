package app.maisim

import android.content.Context
import android.system.Os
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import org.json.JSONArray
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

// a porta do MaiSim do app: as sete a partir dela (7300…7306); a 7100 fica para um MaiSim do Termux no mesmo celular
const val PORTA = 7300

// onde fica cada coisa: o Ubuntu (o rootfs do proot), os circuitos (fora do Ubuntu: trocar o Ubuntu ou o programa não toca
// neles), o temporário do proot e os /proc de mentira; o proot e o loader no nativeLibraryDir (muda a cada atualização do APK)
class Caminhos(ctx: Context) {
    val base: File = ctx.filesDir
    val ubuntu = File(base, "ubuntu")
    val dados = File(base, "MaiSim")
    val tmp = File(base, "proot-tmp")
    val falsos = File(base, "falsos")
    val logs = File(base, "logs")
    val app = File(ubuntu, "root/maisim-app")
    private val nld = File(ctx.applicationInfo.nativeLibraryDir)
    val proot = File(nld, "libproot.so")
    val loader = File(nld, "libproot_loader.so")
}

// o que a primeira abertura faz (e as seguintes conferem): o Ubuntu Base (arm64, conferido pelo SHA256SUMS da Canonical),
// os ajustes que o proot-distro faz (DNS, hosts, /proc de mentira, o apt como root), o curl, e o MaiSim ARM da release mais
// nova (conferido pelo .sha256 dela). O AppRun do MaiSim instala o que falta no Ubuntu (xvfb, as bibliotecas do Java) ao ligar.
class Instalador(private val ctx: Context, private val c: Caminhos) {
    private val ubuntuUrl = "https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/ubuntu-base-24.04.5-base-arm64.tar.gz"
    private val repo = "marcelopedroso/maisim"

    fun garante() {
        listOf(c.dados, c.tmp, c.falsos, c.logs).forEach { it.mkdirs() }
        confereCelular()
        if (!File(c.ubuntu, ".maisim-ok").exists()) instalaUbuntu()
        ajustaUbuntu()
        testaProot()
        ferramentas()
        if (!File(c.app, "AppRun").exists()) instalaMaisim()
    }

    // o mínimo do celular, antes de baixar: o espaço do que falta montar (o Ubuntu com o que o MaiSim instala nele, o MaiSim
    // extraído e, se a pessoa quiser, o Claude Code) e a memória (abaixo de 3 GB o Java e o Python juntos ficam no limite: avisa
    // e deixa tentar). O Android 10+ e os 64 bits o próprio instalador do Android já exige (minSdk, só arm64)
    private fun confereCelular() {
        val gb = 1L shl 30
        val falta = (if (!File(c.ubuntu, ".maisim-ok").exists()) 700L shl 20 else 0L) + (if (!File(c.app, "AppRun").exists()) 800L shl 20 else 0L)
        val livre = android.os.StatFs(c.base.path).availableBytes
        if (falta > 0 && livre < falta) throw Falha(ctx.getString(R.string.erro_espaco, "%.1f".format(falta.toDouble() / gb), "%.1f".format(livre.toDouble() / gb)))
        val mem = android.app.ActivityManager.MemoryInfo()
        (ctx.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).getMemoryInfo(mem)
        if (mem.totalMem < 2_900L * (1L shl 20)) Estado.anota(ctx.getString(R.string.aviso_memoria, "%.1f".format(mem.totalMem.toDouble() / gb)))
    }

    private fun instalaUbuntu() {
        val tgz = File(c.base, "ubuntu.tar.gz")
        Estado.etapa(ctx.getString(R.string.baixando_ubuntu))
        val somas = texto(ubuntuUrl.substringBeforeLast('/') + "/SHA256SUMS")
        val esperado = somas.lines().firstOrNull { it.endsWith(ubuntuUrl.substringAfterLast('/')) }?.substringBefore(' ')
        baixa(ubuntuUrl, tgz)
        if (esperado == null || sha256(tgz) != esperado) { tgz.delete(); throw Falha(ctx.getString(R.string.erro_conferencia)) }
        Estado.etapa(ctx.getString(R.string.extraindo_ubuntu))
        c.ubuntu.deleteRecursively()
        extrai(tgz, c.ubuntu, 0)
        tgz.delete()
        File(c.ubuntu, ".maisim-ok").writeText(ubuntuUrl + "\n")
    }

    // o que o proot-distro faz para o Ubuntu funcionar no Android (proot_distro/sysdata.py): o DNS e o hosts como arquivos
    // comuns, o apt sem o usuário _apt (no proot não há troca de usuário) e os /proc que o Android esconde dos apps
    private fun ajustaUbuntu() {
        val etc = File(c.ubuntu, "etc")
        File(etc, "resolv.conf").let { it.delete(); it.writeText("nameserver 8.8.8.8\nnameserver 1.1.1.1\n") }
        File(etc, "hosts").writeText("127.0.0.1 localhost\n::1 localhost ip6-localhost ip6-loopback\n")
        File(etc, "apt/apt.conf.d").mkdirs()
        File(etc, "apt/apt.conf.d/01-maisim").writeText("APT::Sandbox::User \"root\";\n")
        File(c.ubuntu, "tmp").apply { mkdirs(); Os.chmod(path, "1777".toInt(8)) }
        val n = Runtime.getRuntime().availableProcessors()
        val cpus = (0 until n).joinToString("") { "cpu$it 1957 0 2877 93280 262 342 254 87 0 0\n" }
        mapOf(
            "loadavg" to "0.12 0.07 0.02 2/165 765\n",
            "stat" to "cpu  1957 0 2877 93280 262 342 254 87 0 0\n${cpus}intr 0\nctxt 0\nbtime 1700000000\nprocesses 1\nprocs_running 1\nprocs_blocked 0\n",
            "uptime" to "124.08 932.80\n",
            "version" to "Linux version 6.2.1-MaiSim (proot) #1 SMP PREEMPT_DYNAMIC\n",
            "vmstat" to "nr_free_pages 136352\nnr_zone_inactive_anon 0\nnr_zone_active_anon 0\npgpgin 0\npgpgout 0\n",
            "cap_last_cap" to "40\n",
            "max_user_watches" to "4096\n",
        ).forEach { (k, v) -> File(c.falsos, k).writeText(v) }
        File(c.falsos, "selinux").mkdirs()
    }

    private fun testaProot() {
        Estado.etapa(ctx.getString(R.string.testando))
        val p = Proot.processo(c, listOf("/bin/true")).redirectErrorStream(true).start()
        val saida = p.inputStream.bufferedReader().readText()
        if (p.waitFor() != 0) throw Falha(ctx.getString(R.string.erro_proot, saida.trim().take(400)))
    }

    // o que o Ubuntu Base não traz e o MaiSim usa por fora do AppRun: o curl e os certificados (os instaladores das IAs, o
    // Claude Code e o Cursor CLI, são "curl … | bash"); uma vez, pelo apt de dentro do proot
    private fun ferramentas() {
        if (File(c.ubuntu, "usr/bin/curl").exists() && File(c.ubuntu, "etc/ssl/certs/ca-certificates.crt").exists()) return
        Estado.etapa(ctx.getString(R.string.ferramentas))
        val p = Proot.processo(c, listOf("/bin/sh", "-c",
            "export DEBIAN_FRONTEND=noninteractive; apt-get update -q && apt-get install -y -q --no-install-recommends curl ca-certificates"))
            .redirectErrorStream(true).start()
        p.inputStream.bufferedReader().forEachLine { Estado.anota(it) }
        if (p.waitFor() != 0) throw Falha(ctx.getString(R.string.erro_ferramentas))
    }

    private fun instalaMaisim() {
        // o MaiSim desta versão do app (a mesma do VERSION, a do tag); sem ela (um app montado de outro ponto), a release mais
        // nova (com as -rc) que tem o pacote ARM, como o pacote/android/instala.sh. Depois, o Atualizar do MaiSim segue sozinho
        val v = BuildConfig.VERSION_NAME
        var url: String? = "https://github.com/$repo/releases/download/v$v/MaiSim-$v-aarch64.tar.gz"; var versao = "v$v"
        if (!existe(url!!)) { url = null; versao = "" }
        val rels = if (url == null) JSONArray(texto("https://api.github.com/repos/$repo/releases?per_page=20")) else JSONArray()
        loop@ for (i in 0 until rels.length()) {
            val r = rels.getJSONObject(i); val assets = r.getJSONArray("assets")
            for (j in 0 until assets.length()) {
                val u = assets.getJSONObject(j).getString("browser_download_url")
                if (u.endsWith("-aarch64.tar.gz")) { url = u; versao = r.getString("tag_name"); break@loop }
            }
        }
        if (url == null) throw Falha(ctx.getString(R.string.erro_sem_pacote))
        val tgz = File(c.base, "maisim.tar.gz")
        Estado.etapa(ctx.getString(R.string.baixando_maisim, versao))
        val esperado = texto("$url.sha256").trim().substringBefore(' ')
        baixa(url, tgz)
        if (sha256(tgz) != esperado) { tgz.delete(); throw Falha(ctx.getString(R.string.erro_conferencia)) }
        Estado.etapa(ctx.getString(R.string.extraindo_maisim))
        val novo = File(c.ubuntu, "root/.maisim-app.novo")
        novo.deleteRecursively(); novo.mkdirs()
        extrai(tgz, novo, 0)
        tgz.delete()
        val dentro = novo.listFiles()?.singleOrNull { it.isDirectory } ?: throw Falha(ctx.getString(R.string.erro_sem_pacote))
        c.app.deleteRecursively()
        if (!dentro.renameTo(c.app)) throw Falha(ctx.getString(R.string.erro_instalar, dentro.name))
        novo.deleteRecursively()
    }

    // ---- baixar, conferir, extrair ----
    private fun abre(url: String): HttpURLConnection {
        var u = URL(url)
        repeat(6) {                                            // os redirecionamentos (o GitHub manda para outro servidor)
            val con = u.openConnection() as HttpURLConnection
            con.instanceFollowRedirects = false; con.connectTimeout = 20000; con.readTimeout = 60000
            con.setRequestProperty("User-Agent", "MaiSim-Android")
            val cod = con.responseCode
            if (cod in 300..399) { u = URL(u, con.getHeaderField("Location")); con.disconnect(); return@repeat }
            if (cod != 200) throw Falha(ctx.getString(R.string.erro_rede, "HTTP $cod ${u.host}"))
            return con
        }
        throw Falha(ctx.getString(R.string.erro_rede, "redirect"))
    }

    private fun existe(url: String): Boolean = try { abre(url).run { disconnect(); true } } catch (_: Exception) { false }

    private fun texto(url: String): String = try { abre(url).inputStream.use { it.readBytes().decodeToString() } }
        catch (e: Falha) { throw e } catch (e: Exception) { throw Falha(ctx.getString(R.string.erro_rede, e.message ?: e.javaClass.simpleName)) }

    private fun baixa(url: String, destino: File) {
        try {
            val con = abre(url); val total = con.contentLengthLong
            con.inputStream.use { ent -> destino.outputStream().use { sai ->
                val buf = ByteArray(1 shl 16); var lidos = 0L
                while (true) { val n = ent.read(buf); if (n < 0) break; sai.write(buf, 0, n); lidos += n
                    if (total > 0) Estado.progresso((100 * lidos / total).toInt(), lidos, total) }
            } }
        } catch (e: Falha) { throw e } catch (e: Exception) { throw Falha(ctx.getString(R.string.erro_rede, e.message ?: e.javaClass.simpleName)) }
    }

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        FileInputStream(f).use { val buf = ByteArray(1 shl 16); while (true) { val n = it.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    // o tar.gz com links simbólicos e permissões (o Android não deixa criar hard links nos dados do app: viram cópias)
    private fun extrai(tgz: File, destino: File, strip: Int) {
        val total = tgz.length(); var lidosArq = 0L
        val contador = object : java.io.FilterInputStream(BufferedInputStream(FileInputStream(tgz), 1 shl 16)) {
            override fun read(b: ByteArray, off: Int, len: Int): Int { val n = super.read(b, off, len); if (n > 0) { lidosArq += n
                Estado.progresso((100 * lidosArq / total).toInt(), lidosArq, total) }; return n }
        }
        val duros = mutableListOf<Pair<File, String>>()
        val raiz = destino.canonicalPath
        TarArchiveInputStream(GzipCompressorInputStream(contador)).use { tar ->
            while (true) {
                val e: TarArchiveEntry = tar.nextEntry ?: break
                val nome = e.name.split('/').filter { it.isNotEmpty() && it != "." }.drop(strip).joinToString("/")
                if (nome.isEmpty()) continue
                val f = File(destino, nome)
                if (!f.canonicalPath.startsWith(raiz) && !e.isSymbolicLink) continue      // nada fora da pasta
                f.parentFile?.mkdirs()
                when {
                    e.isDirectory -> { f.mkdirs(); Os.chmod(f.path, (e.mode and "7777".toInt(8)) or "700".toInt(8)) }
                    e.isSymbolicLink -> { f.delete(); try { Os.symlink(e.linkName, f.path) } catch (_: Exception) { } }
                    e.isLink -> duros += f to e.linkName.split('/').filter { it.isNotEmpty() && it != "." }.drop(strip).joinToString("/")
                    e.isFile -> { f.delete(); f.outputStream().use { tar.copyTo(it, 1 shl 16) }
                        Os.chmod(f.path, (e.mode and "7777".toInt(8)) or "600".toInt(8)) }
                    else -> { }                                                         // dispositivos e fifos: o proot usa os do Android
                }
            }
        }
        for ((f, alvo) in duros) { val o = File(destino, alvo); if (o.isFile) { f.delete(); o.copyTo(f); Os.chmod(f.path, Os.stat(o.path).st_mode and "7777".toInt(8)) } }
    }
}

class Falha(msg: String) : Exception(msg)
