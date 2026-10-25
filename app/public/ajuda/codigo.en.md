# Python control

The Control panel (`</>` tab or separate window `?vista=codigo`) lets you write discrete-time digital controllers in Python that interact dynamically with the simulation at each sample period $T_s$.

## Controller code structure

Every controller provides two main lifecycle functions:

```python
def iniciar(p, e):
    e["integral"] = 0.0


def passo(t, m, p, e):
    erro = p["v_ref"] - m["v_out"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    scope("u", u)
    return {"d": u}
```

- **iniciar(p, e):** runs once before the initial calculation step to initialize internal persistent variables in dictionary `e`.
- **passo(t, m, p, e):** executes every sample period $T_s$. Takes current time `t`, sensor measurements `m`, panel parameters `p`, and state `e`.
- **scope(name, value):** exports internal calculation variables in real time directly to the scope graphs for live inspection.
- **Return value:** returns a `{actuator: value}` dictionary mapping outputs directly to circuit actuation blocks (such as CONST blocks).

## Parameters and architecture

- **Sample period ($T_s$):** control loop execution frequency and actuation delay model tuned at the top of the panel.
- **Parameters and triggers table:** define references and controller gains in the panel; program automated step changes over time.
- **File breakdown:** divide logic across `leitura.py`, `controle.py`, and `escrita.py`, or import auxiliary modules written in standard Python.
- **Block diagram:** the **◇ diagram** button generates a clean diagram illustrating inputs, intermediate signals, and output actuators.
