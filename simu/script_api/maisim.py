"""MaiSim script mode (issue #258): the `maisim` module a script imports to send its results to the Scope.

    import numpy as np
    import maisim

    t = np.arange(0, 0.05, 1e-5)
    maisim.scope("sine", t, {"v": np.sin(2 * np.pi * 60 * t)})

Each call writes one run (scope_<name>.npz) in MaiSim's runs folder, which the Scope lists. The folder is set by MaiSim
when it runs the script (MAISIM_SCRIPT_RODADAS); run by hand, it falls back to MAISIM_RODADAS, then MAISIM_DADOS/rodadas,
then ~/.local/share/maisim/rodadas. There is no path argument on purpose: the results stay inside MaiSim.

Messages here are in English: this module runs inside the user's script, outside MaiSim's translated servers."""
import json
import os
import re
import shutil
import time
from pathlib import Path

import numpy as np

__all__ = ["scope"]


def _runs_folder():
    for var in ("MAISIM_SCRIPT_RODADAS", "MAISIM_RODADAS"):
        if os.environ.get(var):
            return Path(os.environ[var]).expanduser()
    return Path(os.environ.get("MAISIM_DADOS") or "~/.local/share/maisim").expanduser() / "rodadas"


def _clean(name, what):
    clean = re.sub(r"[^A-Za-z0-9_]+", "_", str(name)).strip("_")
    if not clean:
        raise ValueError(f"maisim.scope: invalid {what} name: {name!r}")
    return clean


def scope(name, t, signals, panels=None, paineis=None):
    """Write a run with the time vector `t` (seconds, increasing) and `signals` ({signal name: vector the size of t}).

    panels  optional list of panels, each a list of signal names shown together, e.g. [["ref", "carrier"], ["pulse"]].
            (`paineis` is the same, in Portuguese.) It becomes this script's default Scope layout.
    Returns the path of the .npz written."""
    run = _clean(name, "run")
    t = np.asarray(t, dtype=float)
    if t.ndim != 1 or t.size < 2:
        raise ValueError("maisim.scope: t must be a 1-D vector with at least two samples")
    if not np.all(np.diff(t) > 0):
        raise ValueError("maisim.scope: t must be strictly increasing")
    cols = {}
    for key, values in dict(signals).items():
        key = _clean(key, "signal")
        if key in ("t", "meta"):
            raise ValueError(f"maisim.scope: {key!r} is reserved, pick another signal name")
        v = np.asarray(values, dtype=float)
        if v.shape != t.shape:
            raise ValueError(f"maisim.scope: signal {key!r} has shape {v.shape}, t has {t.shape}")
        cols[key] = v
    if not cols:
        raise ValueError("maisim.scope: no signals to write")
    script = os.environ.get("MAISIM_SCRIPT_ARQ") or ""
    dt = float(np.median(np.diff(t)))
    meta = {"planta": "maisim-script", "rotulo": run, "modelo": script or "script",
            "script": os.environ.get("MAISIM_SCRIPT_NOME") or Path(script).stem or "script", "dt": dt, "Ts": dt,
            "tfim": float(t[-1]), "sinais": [{"canal": k} for k in cols]}
    folder = _runs_folder() / f"{time.strftime('%Y-%m-%d_%H%M%S')}_{run}"
    n = 2
    while folder.exists():                                    # two runs with the same name in the same second
        folder = folder.with_name(f"{time.strftime('%Y-%m-%d_%H%M%S')}_{run}_{n}")
        n += 1
    folder.mkdir(parents=True)
    out = folder / f"scope_{run}.npz"
    np.savez_compressed(out, meta=json.dumps(meta, ensure_ascii=False), t=t, **cols)
    if os.environ.get("MAISIM_SCRIPT_VEZ"):                   # which MaiSim run wrote this folder (two runs at once)
        (folder / ".maisim_vez").write_text(os.environ["MAISIM_SCRIPT_VEZ"], encoding="utf-8")
    if os.environ.get("MAISIM_SCRIPT_RODADA") == "substitui":
        _replace_previous(folder, run)
    groups = panels if panels is not None else paineis
    if groups is not None:
        _write_layout(groups, cols, run)
    return out


def _replace_previous(new_folder, run):
    """Like the circuit runs: the new run replaces the earlier ones of the same script with the same run name, except the
    ones kept in the Scope (the ".guardada" marker) and the ones written by this same execution (two calls, same name)."""
    script = os.environ.get("MAISIM_SCRIPT_NOME") or ""
    vez = os.environ.get("MAISIM_SCRIPT_VEZ") or ""
    pattern = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{6}_" + re.escape(run) + r"(_\d+)?$")
    for d in new_folder.parent.iterdir():
        if d == new_folder or not d.is_dir() or not pattern.match(d.name) or (d / ".guardada").exists():
            continue
        if vez and (d / ".maisim_vez").is_file() and (d / ".maisim_vez").read_text(encoding="utf-8").strip() == vez:
            continue
        npz = d / f"scope_{run}.npz"
        try:
            with np.load(npz, allow_pickle=True) as z:
                meta = json.loads(str(z["meta"]))
        except (OSError, ValueError, KeyError):
            continue
        if meta.get("planta") == "maisim-script" and meta.get("script") == script:
            shutil.rmtree(d, ignore_errors=True)


def _write_layout(groups, cols, run=""):
    """The panels as the Scope's layout (the same format as a circuit's <name>.scope.json), next to the script. Each run name
    keeps its own panels ("rodadas"), so a script that writes two runs with different signals shows each one right; the
    top level is the last one written (the script's default)."""
    items = []
    for g in groups:
        names = [_clean(x, "signal") for x in ([g] if isinstance(g, str) else g)]
        missing = [x for x in names if x not in cols]
        if missing:
            raise ValueError(f"maisim.scope: panels name signals that were not written: {missing}")
        items.append({"titulo": ", ".join(names), "sinais": names, "largura": 1})
    if not items:
        return
    dest = os.environ.get("MAISIM_SCRIPT_LAYOUT")
    if not dest:                                              # run by hand, outside MaiSim: no layout file
        return
    try:
        old = json.loads(Path(dest).read_text(encoding="utf-8"))
        by_run = old.get("rodadas") if isinstance(old.get("rodadas"), dict) else {}
    except (OSError, ValueError, AttributeError):
        by_run = {}
    layout = {"itens": items, "colunas": 1}
    if run:
        by_run[run] = layout
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    Path(dest).write_text(json.dumps({**layout, "rodadas": by_run}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
