"""O ambiente do simulador de teste (a porta 7201 do perfil de teste), para os testes que leem as pastas dele
(MAISIM_CLAUDE_DIR, MAISIM_SALVOS…). No Linux, o do próprio processo (/proc/<pid>/environ: o que ele recebeu de fato);
fora do Linux (o Windows, onde não há /proc nem ss), o perfil de teste (config/teste.env), que é o que o lançador deu a
ele (MAISIM_PERFIL=teste)."""
import subprocess, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def ambiente(porta=7201):
    if Path("/proc").is_dir():
        try:
            pid = subprocess.run(f"ss -ltnp | grep ':{porta} ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True,
                                 capture_output=True, text=True).stdout.strip()
            if pid:
                return dict(x.split("=", 1) for x in Path(f"/proc/{pid}/environ").read_bytes().decode().split("\0") if "=" in x)
        except OSError:
            pass
    sys.path.insert(0, str(RAIZ / "config"))
    import ler_config
    return ler_config.carrega("teste")


if __name__ == "__main__":                      # para os testes de tela (node): o ambiente em JSON
    import json
    print(json.dumps(ambiente(int(sys.argv[1]) if len(sys.argv) > 1 else 7201)))
