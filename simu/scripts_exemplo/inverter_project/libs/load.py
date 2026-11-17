"""pt: uma carga RL integrada passo a passo, usada pelo main.py desta pasta.
en: an RL load integrated step by step, used by main.py in this folder."""


class RLLoad:
    def __init__(self, R, L):
        self.R, self.L, self.i = R, L, 0.0

    def step(self, v, dt):
        """pt: avança um passo com a tensão v e devolve a corrente / en: advances one step with voltage v, returns the current."""
        self.i += dt * (v - self.R * self.i) / self.L
        return self.i
