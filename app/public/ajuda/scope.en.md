# Scope and measurements

The Scope (`/maisim/scope/`) is MaiSim's multichannel oscilloscope for real-time waveform display, simulation comparisons, and rigorous power electronics signal analysis.

## Panels and waveforms

- **Modular layout:** build multiple plotting panels and arrange signals into dedicated plots grouped by electrical quantity (voltage, current, power).
- **Zoom and panning:** scroll the mouse wheel over a plot to zoom; click and drag horizontally to pan along the time axis; double-click to reset zoom.
- **Independent or locked Y-axes:** enforce explicit vertical limits for individual channels or leave them on dynamic auto-scale.
- **Colors and styling:** modify trace colors, stroke widths, and dash styles (solid, dashed) by clicking on the signal's color indicator.

## Measurement and analysis tools

- **Automated metrics:** click a panel's measurement drawer to evaluate mean, true RMS, peak-to-peak, fundamental frequency, and total harmonic distortion (THD).
- **Harmonic spectrum (FFT):** launch the Fourier spectrum view to analyze harmonic distribution and frequency spikes for any waveform.
- **Run comparison:** leverage the comparison tool to overlay waveforms from the current run against historical recordings.
- **Data export:** export time-domain arrays directly into CSV or NPZ files for post-processing in NumPy, MATLAB, or custom Python scripts.
