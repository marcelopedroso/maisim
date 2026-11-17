"""pt: funções de modulação, usadas pelo main.py desta pasta (from libs import modulation).
en: modulation functions, used by main.py in this folder (from libs import modulation)."""


def triangle(t, f):
    """pt: portadora triangular de -1 a 1 no instante t / en: triangular carrier from -1 to 1 at time t."""
    fase = (t * f) % 1.0
    return 4 * fase - 1 if fase < 0.5 else 3 - 4 * fase


def spwm_unipolar(ref, carrier):
    """pt: as duas pernas da ponte completa (1 = chave de cima ligada) e a tensão em unidades de Vdc (-1, 0 ou 1).
    en: the two legs of the full bridge (1 = top switch on) and the voltage in units of Vdc (-1, 0 or 1)."""
    a = 1 if ref > carrier else 0
    b = 1 if -ref > carrier else 0
    return a, b, a - b
