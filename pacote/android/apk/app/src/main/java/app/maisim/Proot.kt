package app.maisim

// o proot (o do Termux, compilado para rodar fora dele): o Ubuntu do app como raiz, root de mentira, os /dev, /proc e /sys
// do Android, os /proc de mentira e os circuitos (fora do Ubuntu) em /root/MaiSim. O ambiente começa vazio: só o que o
// MaiSim precisa (sem navegador para abrir; a porta do app)
object Proot {
    fun processo(c: Caminhos, programa: List<String>): ProcessBuilder {
        val u = c.ubuntu.path; val f = c.falsos.path
        val args = mutableListOf(
            // sem --kill-on-exit: o Atualizar do MaiSim para o atual e liga o novo à parte (sessão própria); o proot fica no ar
            // enquanto houver um processo dentro dele, e o Parar desliga todos (o lançador --parar)
            c.proot.path, "--link2symlink", "--sysvipc", "-L", "--root-id",
            "--rootfs=$u", "--cwd=/root",
            "--bind=/dev", "--bind=/proc", "--bind=/sys",
            "--bind=/dev/urandom:/dev/random", "--bind=/proc/self/fd:/dev/fd",
            "--bind=/proc/self/fd/0:/dev/stdin", "--bind=/proc/self/fd/1:/dev/stdout", "--bind=/proc/self/fd/2:/dev/stderr",
            "--bind=$u/tmp:/dev/shm",
            "--bind=$f/loadavg:/proc/loadavg", "--bind=$f/stat:/proc/stat", "--bind=$f/uptime:/proc/uptime",
            "--bind=$f/version:/proc/version", "--bind=$f/vmstat:/proc/vmstat",
            "--bind=$f/cap_last_cap:/proc/sys/kernel/cap_last_cap",
            "--bind=$f/max_user_watches:/proc/sys/fs/inotify/max_user_watches",
            "--bind=$f/selinux:/sys/fs/selinux",
            "--bind=${c.dados.path}:/root/MaiSim",
            "/usr/bin/env", "-i", "HOME=/root", "LANG=C.UTF-8", "TMPDIR=/tmp", "TERM=dumb",
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "MAISIM_NAVEGADOR=nenhum", "MAISIM_PORTA=$PORTA",
        )
        args += programa
        val pb = ProcessBuilder(args)
        pb.environment().clear()
        pb.environment()["PROOT_LOADER"] = c.loader.path
        pb.environment()["PROOT_TMP_DIR"] = c.tmp.path
        return pb
    }
}
