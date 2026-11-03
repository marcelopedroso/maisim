package app.maisim

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

// o estado que a tela mostra (a etapa, o progresso, as últimas linhas do MaiSim, pronto ou erro): o serviço escreve, a tela lê
object Estado {
    @Volatile var etapa = ""; @Volatile var progresso = -1; @Volatile var bytes = 0L; @Volatile var total = 0L
    @Volatile var pronto = false; @Volatile var erro: String? = null; @Volatile var rodando = false
    private val linhas = ArrayDeque<String>()
    fun etapa(t: String) { etapa = t; progresso = -1; bytes = 0; total = 0 }
    fun progresso(p: Int, b: Long, t: Long) { progresso = p; bytes = b; total = t }
    fun anota(l: String) = synchronized(linhas) { linhas.addLast(l); while (linhas.size > 8) linhas.removeFirst() }
    fun ultimas(): String = synchronized(linhas) { linhas.joinToString("\n") }
}

// o serviço em primeiro plano: prepara (a primeira vez), liga o MaiSim dentro do proot e o mantém ligado enquanto o app é
// usado (a notificação, com o Parar); o Android não mata um serviço assim no meio de uma simulação
class MaiSimService : Service() {
    private var proc: Process? = null
    private var trava: PowerManager.WakeLock? = null
    @Volatile private var parando = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "parar") { para(); return START_NOT_STICKY }
        primeiroPlano()
        if (!Estado.rodando) { parando = false; Estado.rodando = true; Estado.erro = null; Estado.pronto = false; Thread { roda() }.start() }
        return START_STICKY
    }

    private fun primeiroPlano() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("maisim", getString(R.string.notif_canal), NotificationManager.IMPORTANCE_LOW))
        val abrir = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val parar = PendingIntent.getService(this, 1, Intent(this, MaiSimService::class.java).setAction("parar"), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "maisim").setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.notif_canal)).setContentText(getString(R.string.notif_texto))
            .setContentIntent(abrir).setOngoing(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.parar), parar).build()).build()
        if (android.os.Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)                                     // (o tipo specialUse só existe no Android 14+)
        if (trava == null) trava = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "maisim:servidor").apply { acquire() }
    }

    private fun roda() {
        val c = Caminhos(this)
        try {
            val primeira = !File(c.app, "AppRun").exists()
            Instalador(this, c).garante()
            if (parando) return                                        // o Parar durante a preparação: não liga o MaiSim
            Estado.etapa(getString(if (primeira) R.string.ligando_1a else R.string.ligando))
            val p = synchronized(this) {                                // (o Parar pode chegar agora: confere de novo junto com o start)
                if (parando) return
                Proot.processo(c, listOf("/root/maisim-app/AppRun")).redirectErrorStream(true).start().also { proc = it }
            }
            val log = File(c.logs, "maisim.log").printWriter()
            Thread { p.inputStream.bufferedReader().forEachLine { Estado.anota(it); log.println(it); log.flush() } }.start()
            while (p.isAlive && !Estado.pronto) {                      // pronto quando a tela do celular responde
                if (responde()) Estado.pronto = true else Thread.sleep(1000)
            }
            val cod = p.waitFor(); log.close()
            if (!parando) Estado.erro = getString(R.string.erro_parou, cod)
        } catch (e: Exception) {
            Estado.erro = e.message ?: e.javaClass.simpleName
        } finally {
            Estado.rodando = false; Estado.pronto = false
        }
    }

    private fun responde(): Boolean = try {
        (URL("http://127.0.0.1:$PORTA/movel.html").openConnection() as HttpURLConnection).run {
            connectTimeout = 1500; readTimeout = 1500; val ok = responseCode == 200; disconnect(); ok }
    } catch (_: Exception) { false }

    // parar: o lançador do MaiSim desliga os servidores (com a porta do app); depois o proot e o serviço
    private fun para() {
        val ligado = synchronized(this) { parando = true; proc != null }   // ainda preparando: não há MaiSim para desligar
        Thread {
            if (ligado) try { Proot.processo(Caminhos(this), listOf("/root/maisim-app/AppRun", "--parar")).start().waitFor() } catch (_: Exception) { }
            proc?.destroy()
            trava?.let { if (it.isHeld) it.release() }; trava = null
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
        }.start()
    }

    override fun onDestroy() { trava?.let { if (it.isHeld) it.release() }; super.onDestroy() }
}
