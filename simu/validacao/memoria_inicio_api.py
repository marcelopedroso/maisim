"""A memória do MaiSim logo depois de subir, antes de qualquer teste (o 1º da suíte): a foto "parada" do memoria_api.py, sem
rodar nada; grava <MAISIM_DADOS>/bateria/memoria_inicio.json. O memoria_api.py (mais adiante) mede de novo depois dos testes
de tela, com circuitos abertos e no pico de rodadas longas."""
import os, runpy
from pathlib import Path

os.environ["MAISIM_MEMORIA_INICIO"] = "1"
runpy.run_path(str(Path(__file__).resolve().parent / "memoria_api.py"), run_name="__main__")
