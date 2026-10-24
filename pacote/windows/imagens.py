"""As imagens do instalador do Windows, tiradas da marca do MaiSim (app/public/marca/maisim-app-512.png): o ícone
(maisim.ico, vários tamanhos), a faixa lateral do assistente (wizard.bmp) e o ícone pequeno do topo (wizard_pequeno.bmp).
uso: python3 pacote/windows/imagens.py <pasta de saída>   (precisa do Pillow)"""
import sys
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
saida = Path(sys.argv[1]); saida.mkdir(parents=True, exist_ok=True)
logo = Image.open(RAIZ / "app" / "public" / "marca" / "maisim-app-512.png").convert("RGBA")
logo.save(saida / "maisim.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def chapa(w, h, lado, fundo):
    """O logo centrado (lado px) num fundo liso, sem transparência (o Inno Setup quer BMP)."""
    im = Image.new("RGB", (w, h), fundo)
    l = logo.resize((lado, lado), Image.LANCZOS)
    im.paste(l, ((w - lado) // 2, (h - lado) // 2), l)
    return im


for esc in (1, 2):                                # 100 % e 200 % (telas de alta densidade)
    sufixo = "" if esc == 1 else "_200"
    chapa(164 * esc, 314 * esc, 120 * esc, (247, 244, 255)).save(saida / f"wizard{sufixo}.bmp")
    chapa(55 * esc, 55 * esc, 48 * esc, (255, 255, 255)).save(saida / f"wizard_pequeno{sufixo}.bmp")
print("imagens:", sorted(p.name for p in saida.iterdir()))
