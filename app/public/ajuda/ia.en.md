# MaiSim's Claude

The embedded AI assistant in MaiSim couples state-of-the-art language models directly into your power electronics design and controller tuning process.

## How the integration works

- **Isolated session:** login is managed through the AI accounts window (**✦** button or side rail AI icon) and resides in `~/.claude-maisim/`, completely separate from system tokens.
- **Chat drawer:** accessible directly from the [Control](#ajuda:codigo) tab, maintaining contextual awareness of the active circuit workspace.
- **Assistant visibility:** Claude inspects the schematic topology, selected sensors, actuators, Python source files, and numeric summary metrics from the latest run.
- **Proposals with diff inspection:** code modifications suggested by the AI are never applied silently; you inspect the side-by-side diff and click Apply or Discard.

## Autonomous tuning mode

- **Iterative tuning loop:** configure an autonomous run limit (3, 5, 10, or 20 runs) letting Claude simulate, read waveform data, adjust gains, and repeat.
- **Stopping conditions:** the assistant terminates when control goals are fulfilled or upon reaching the specified maximum iterations budget.
- **Focus on digital control:** the AI optimizes control parameters and Python files; if schematic changes are needed, it explains step-by-step instructions for manual edits.
- **Windows installation:** the accounts manager automatically detects missing CLI components and provides a one-click install button on Windows.
