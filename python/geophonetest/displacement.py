"""
Geophone displacement recovery - two modes in one script.

  python displacement.py demo
      Runs the synthetic validation test: a made-up signal where we know the exact right
      answer, so we can grade the math (see run_demo()'s docstring for the full explanation).

  python displacement.py live --file your_data.csv
      Processes a REAL recording: loads raw voltage + timestamps from a CSV, converts voltage
      to velocity using your geophone's sensitivity spec, then runs the same drift-correction
      + integration pipeline the demo validated. There's no known-correct answer for real data,
      so this reports sanity-check stats instead of an error score (see run_live()'s docstring).

Both modes share the same core math (integrate_trapezoidal, integrate_simpsons,
highpass_filter) - that's the part demo mode exists to validate before you trust it here.

Setup (once):
    pip install -r ../requirements.txt

Try it right now, no real data needed yet:
    python displacement.py demo
    python displacement.py live --file sample_data.csv
"""

import argparse
import csv

import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import cumulative_simpson, cumulative_trapezoid
from scipy.signal import butter, sosfiltfilt


# ---------------------------------------------------------------------------
# Shared configuration - real hardware parameters, used by both modes
# ---------------------------------------------------------------------------

SAMPLE_RATE_HZ = 100.0   # your real geophone's sample rate
HIGHPASS_CUTOFF_HZ = 0.5  # frequencies below this are assumed to be drift, not real motion -
                          # TODO: tune this once you know how long a real event (e.g. a vehicle
                          # crossing) lasts; the cutoff needs to sit comfortably below that
                          # event's own frequency content, or the filter starts eating the
                          # signal you actually care about, not just the drift.

# *** PLACEHOLDER - replace with your geophone's actual datasheet sensitivity ***
# Geophones report a sensitivity like "X volts per inch/second" (check your specific model's
# spec sheet - it may instead be given per mm/s or m/s, in which case convert it to in/s first
# so this stays consistent with the rest of this app's US-customary units).
#
# CAVEAT: this simple divide-by-a-constant conversion only holds ABOVE the geophone's own
# natural/corner frequency (commonly 4.5-10 Hz on off-the-shelf units) - below that, the
# sensor's own mechanical response rolls off and under-reports true ground velocity. If your
# bridge's vibration modes are at or below your geophone's corner frequency, this conversion
# alone isn't enough - you'd need to deconvolve the sensor's own transfer function, not just
# divide by a constant. Come back to this once you know your exact geophone model/spec.
GEOPHONE_SENSITIVITY_V_PER_IN_S = 1.0


def voltage_to_velocity(voltage_v, sensitivity_v_per_in_s=GEOPHONE_SENSITIVITY_V_PER_IN_S):
    """Converts raw geophone output voltage to velocity, in/s. See the sensitivity constant's
    comment above for the important caveat about low-frequency accuracy."""
    return voltage_v / sensitivity_v_per_in_s


# ---------------------------------------------------------------------------
# The two integration methods you asked about (shared - both modes use these)
# ---------------------------------------------------------------------------

def integrate_trapezoidal(velocity, t):
    """Cumulative (rolling) trapezoidal sum: at each point, area-so-far = area up to the
    previous point + the area of the thin trapezoid between the previous and current sample.
    Simple and robust - this is usually the right default choice."""
    return cumulative_trapezoid(velocity, t, initial=0)


def integrate_simpsons(velocity, t):
    """Cumulative Simpson's rule: fits a small curve (not just a straight line) through each
    trio of neighboring points before measuring the area under it, which is slightly more
    accurate than trapezoidal for smoothly-curving signals sampled at a steady rate."""
    return cumulative_simpson(velocity, x=t, initial=0)


def highpass_filter(signal, fs, cutoff_hz=HIGHPASS_CUTOFF_HZ, order=4):
    """Removes the constant bias and any slow wander from a signal before it gets integrated,
    by filtering out everything below `cutoff_hz`. Uses the "second-order sections" (sos)
    filter representation rather than the plain transfer-function form - with a cutoff this
    far below the sample rate, the plain form loses enough numerical precision to become
    unstable and produce garbage output. `sosfiltfilt` runs the filter forward and backward so
    it doesn't shift the wave in time - important since we care about the exact shape/timing
    of the motion, not just its rough presence.

    NOTE: being zero-phase, this needs a few seconds of "runway" at each end of whatever
    signal it's given to settle in - see TRIM_SECONDS (demo mode) / --trim (live mode)."""
    nyquist = fs / 2
    sos = butter(order, cutoff_hz / nyquist, btype="high", output="sos")
    return sosfiltfilt(sos, signal)


# ---------------------------------------------------------------------------
# DEMO mode - synthetic signal with a known-correct answer, to validate the math
# ---------------------------------------------------------------------------

DEMO_DURATION_SEC = 600.0  # matches your real recording length, so filter settling behaves
                           # the same way here as it will on real data
DEMO_TRIM_SECONDS = 5.0

# Pretend the bridge is vibrating at two frequencies at once (like two structural modes),
# each with its own amplitude (inches) and phase offset.
MODE_1_FREQ_HZ, MODE_1_AMPLITUDE_IN = 2.3, 0.08
MODE_2_FREQ_HZ, MODE_2_AMPLITUDE_IN = 6.1, 0.03

# How "bad" the simulated sensor imperfections are - turn these up/down to see their effect.
VELOCITY_NOISE_STD_IN_S = 0.02   # random measurement noise added to the "measured" velocity
VELOCITY_BIAS_IN_S = 0.015       # constant offset error (this is what causes the ramp drift)


def generate_synthetic_signal():
    """Returns (t, true_displacement_in, true_velocity_in_s, measured_velocity_in_s).

    true_displacement/true_velocity are the exact mathematical answer (displacement and its
    exact derivative). measured_velocity is what a real geophone would output: the true
    velocity plus noise and a small constant bias - this is the only thing "integrate"
    functions above are allowed to look at.
    """
    t = np.arange(0, DEMO_DURATION_SEC, 1.0 / SAMPLE_RATE_HZ)

    true_displacement_in = (
        MODE_1_AMPLITUDE_IN * np.sin(2 * np.pi * MODE_1_FREQ_HZ * t)
        + MODE_2_AMPLITUDE_IN * np.sin(2 * np.pi * MODE_2_FREQ_HZ * t + 0.6)
    )

    # The derivative of A*sin(2*pi*f*t) is A*2*pi*f*cos(2*pi*f*t) - basic calculus, computed
    # here analytically so "true_velocity" is exact, not itself an approximation.
    true_velocity_in_s = (
        MODE_1_AMPLITUDE_IN * 2 * np.pi * MODE_1_FREQ_HZ * np.cos(2 * np.pi * MODE_1_FREQ_HZ * t)
        + MODE_2_AMPLITUDE_IN * 2 * np.pi * MODE_2_FREQ_HZ * np.cos(2 * np.pi * MODE_2_FREQ_HZ * t + 0.6)
    )

    rng = np.random.default_rng(seed=42)  # fixed seed so the "random" noise is reproducible
    noise = rng.normal(0, VELOCITY_NOISE_STD_IN_S, size=t.shape)
    measured_velocity_in_s = true_velocity_in_s + noise + VELOCITY_BIAS_IN_S

    return t, true_displacement_in, true_velocity_in_s, measured_velocity_in_s


def generate_live_window(end_time, window_seconds, sample_rate_hz=SAMPLE_RATE_HZ):
    """Same synthetic sensor model as generate_synthetic_signal, but keyed off an absolute
    wall-clock timestamp (`end_time`, seconds since epoch - i.e. time.time()) instead of
    always starting at t=0, covering [end_time - window_seconds, end_time]. Used by the live
    API (../api/main.py) so consecutive polls see a continuously evolving signal rather than
    restarting from scratch each time - the same trick this app's other SIMULATED sensors use
    (seeding their sine waves off the current timestamp). No known-correct "true" values are
    returned here since there's nothing to compare against outside of demo mode.
    """
    t = np.arange(end_time - window_seconds, end_time, 1.0 / sample_rate_hz)

    true_velocity_in_s = (
        MODE_1_AMPLITUDE_IN * 2 * np.pi * MODE_1_FREQ_HZ * np.cos(2 * np.pi * MODE_1_FREQ_HZ * t)
        + MODE_2_AMPLITUDE_IN * 2 * np.pi * MODE_2_FREQ_HZ * np.cos(2 * np.pi * MODE_2_FREQ_HZ * t + 0.6)
    )

    rng = np.random.default_rng()  # unseeded - genuinely fresh noise each poll, like a live sensor
    noise = rng.normal(0, VELOCITY_NOISE_STD_IN_S, size=t.shape)
    measured_velocity_in_s = true_velocity_in_s + noise + VELOCITY_BIAS_IN_S

    return t, measured_velocity_in_s


def rmse(estimate, truth):
    return float(np.sqrt(np.mean((estimate - truth) ** 2)))


def rmse_shape(estimate, truth):
    """RMSE after subtracting each curve's own mean first - i.e. "ignore whatever constant
    height each curve settled at, just compare the wobble". This is the fair way to grade
    the high-pass-filtered results: a high-pass filter, by definition, throws away the
    absolute/DC position information along with the drift, so filtered displacement is only
    ever meaningful as MOTION AROUND a baseline, never as an absolute position. That's not a
    flaw here - it's exactly what matters for detecting a vehicle's deflection wobble on top
    of the bridge's static position, which is the actual end goal."""
    return float(np.sqrt(np.mean(((estimate - estimate.mean()) - (truth - truth.mean())) ** 2)))


def run_demo():
    """See the module docstring - this is the synthetic, known-correct-answer validation."""
    t, true_displacement, true_velocity, measured_velocity = generate_synthetic_signal()
    filtered_velocity = highpass_filter(measured_velocity, SAMPLE_RATE_HZ)

    results = {
        "Trapezoidal - no drift correction": integrate_trapezoidal(measured_velocity, t),
        "Trapezoidal - high-pass filtered": integrate_trapezoidal(filtered_velocity, t),
        "Simpson's - no drift correction": integrate_simpsons(measured_velocity, t),
        "Simpson's - high-pass filtered": integrate_simpsons(filtered_velocity, t),
    }

    # Discard the settle-in buffer at both ends (see highpass_filter's docstring) before
    # scoring or plotting - everyone (true signal and all 4 result variants) gets the same
    # trim, so it's still an apples-to-apples comparison.
    keep = (t >= DEMO_TRIM_SECONDS) & (t <= DEMO_DURATION_SEC - DEMO_TRIM_SECONDS)
    t_trimmed = t[keep]
    true_displacement_trimmed = true_displacement[keep]
    results_trimmed = {label: displacement[keep] for label, displacement in results.items()}

    print(f"Over the middle {t_trimmed[-1] - t_trimmed[0]:.0f}s (lower is better, inches RMS):\n")
    print(f"  {'':38s} {'vs. absolute position':>22s} {'vs. shape (demeaned)':>22s}")
    for label, displacement in results_trimmed.items():
        abs_err = rmse(displacement, true_displacement_trimmed)
        shape_err = rmse_shape(displacement, true_displacement_trimmed)
        print(f"  {label:38s} {abs_err:22.4f} {shape_err:22.4f}")
    print(
        "\nNotice the high-pass filtered rows: bad on absolute position, excellent on shape.\n"
        "That's expected, not a bug - see rmse_shape()'s docstring."
    )

    fig, axes = plt.subplots(3, 1, figsize=(10, 9), sharex=True)

    axes[0].set_title("Velocity: what the geophone actually reports")
    axes[0].plot(t, true_velocity, label="True velocity", color="black", linewidth=1)
    axes[0].plot(t, measured_velocity, label="Measured (noisy + biased)", color="tab:red", alpha=0.6)
    axes[0].set_ylabel("in/s")
    axes[0].legend(loc="upper right")

    axes[1].set_title("Displacement WITHOUT drift correction - watch it wander away from the truth")
    axes[1].plot(t_trimmed, true_displacement_trimmed, label="True displacement", color="black", linewidth=2)
    axes[1].plot(t_trimmed, results_trimmed["Trapezoidal - no drift correction"], label="Trapezoidal", color="tab:orange")
    axes[1].plot(t_trimmed, results_trimmed["Simpson's - no drift correction"], label="Simpson's", color="tab:blue", linestyle="--")
    axes[1].set_ylabel("in")
    axes[1].legend(loc="upper right")

    # Shown demeaned (each curve shifted to its own average) - a high-pass filter recovers the
    # correct MOTION/shape but not the absolute position, so comparing raw values here would
    # just show a constant offset instead of the thing this step actually fixes. See
    # rmse_shape()'s docstring.
    axes[2].set_title("Displacement WITH drift correction, shown relative to each curve's own average")
    axes[2].plot(t_trimmed, true_displacement_trimmed - true_displacement_trimmed.mean(), label="True displacement", color="black", linewidth=2)
    trap_filt = results_trimmed["Trapezoidal - high-pass filtered"]
    simp_filt = results_trimmed["Simpson's - high-pass filtered"]
    axes[2].plot(t_trimmed, trap_filt - trap_filt.mean(), label="Trapezoidal", color="tab:orange")
    axes[2].plot(t_trimmed, simp_filt - simp_filt.mean(), label="Simpson's", color="tab:blue", linestyle="--")
    axes[2].set_ylabel("in")
    axes[2].set_xlabel("Time (s)")
    axes[2].legend(loc="upper right")

    fig.tight_layout()
    plt.show()


# ---------------------------------------------------------------------------
# LIVE mode - real recorded data, no known-correct answer to grade against
# ---------------------------------------------------------------------------

def load_real_data(filepath):
    """Reads a 2-column CSV with a header row: time_s, voltage_v

    Adjust this function if your actual export has different column names/units/extra
    columns - it just needs to end up returning (time_seconds_array, voltage_volts_array).
    """
    time_s = []
    voltage_v = []
    with open(filepath, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            time_s.append(float(row["time_s"]))
            voltage_v.append(float(row["voltage_v"]))
    return np.array(time_s), np.array(voltage_v)


def run_live(filepath, trim_seconds):
    """Processes a real recording. Unlike run_demo(), there's no known-correct displacement
    to grade against, so instead of an error score this prints sanity-check stats: if your
    recording includes a known-quiet (no-traffic) stretch, the corrected displacement should
    sit close to a flat baseline there - if it's still drifting or absurdly large, something
    upstream is wrong (wrong sensitivity value, cutoff frequency too low/high, bad data, etc.)
    regardless of what any of these numbers say. See the earlier conversation for other real
    verification strategies (injecting a known signal into real quiet-period noise, cross-
    checking against an independent sensor, a controlled field test)."""
    t, voltage = load_real_data(filepath)
    measured_velocity = voltage_to_velocity(voltage)

    detected_fs = 1.0 / np.median(np.diff(t))
    print(f"Loaded {len(t)} samples spanning {t[-1] - t[0]:.1f}s (detected sample rate ~{detected_fs:.1f} Hz).")
    if abs(detected_fs - SAMPLE_RATE_HZ) > 1.0:
        print(f"  WARNING: this doesn't match SAMPLE_RATE_HZ={SAMPLE_RATE_HZ:.1f} - check for dropped samples or update the constant.")

    filtered_velocity = highpass_filter(measured_velocity, SAMPLE_RATE_HZ)
    disp_trap = integrate_trapezoidal(filtered_velocity, t)
    disp_simp = integrate_simpsons(filtered_velocity, t)

    keep = (t >= t[0] + trim_seconds) & (t <= t[-1] - trim_seconds)
    t_trimmed = t[keep]
    disp_trap_trimmed = disp_trap[keep] - disp_trap[keep].mean()
    disp_simp_trimmed = disp_simp[keep] - disp_simp[keep].mean()

    print(f"\nOver the middle {t_trimmed[-1] - t_trimmed[0]:.0f}s, displacement relative to its own average (inches):")
    print(f"  Trapezoidal: min {disp_trap_trimmed.min():.4f}  max {disp_trap_trimmed.max():.4f}  std {disp_trap_trimmed.std():.4f}")
    print(f"  Simpson's:   min {disp_simp_trimmed.min():.4f}  max {disp_simp_trimmed.max():.4f}  std {disp_simp_trimmed.std():.4f}")
    print(
        "\nRemember: this is RELATIVE motion around a baseline, not absolute position - a\n"
        "high-pass filter can't recover the latter (see highpass_filter's docstring)."
    )

    fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=True)

    axes[0].set_title("Measured velocity (converted from voltage)")
    axes[0].plot(t, measured_velocity, color="tab:red", linewidth=0.8)
    axes[0].set_ylabel("in/s")

    axes[1].set_title("Displacement, high-pass filtered, relative to its own average")
    axes[1].plot(t_trimmed, disp_trap_trimmed, label="Trapezoidal", color="tab:orange")
    axes[1].plot(t_trimmed, disp_simp_trimmed, label="Simpson's", color="tab:blue", linestyle="--")
    axes[1].set_ylabel("in")
    axes[1].set_xlabel("Time (s)")
    axes[1].legend(loc="upper right")

    fig.tight_layout()
    plt.show()


# ---------------------------------------------------------------------------
# CLI - pick a mode when you run the script
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Geophone displacement recovery - demo (synthetic) or live (real data) mode.")
    subparsers = parser.add_subparsers(dest="mode", required=True)

    subparsers.add_parser("demo", help="Run the synthetic validation test (no file needed).")

    live_parser = subparsers.add_parser("live", help="Process a real recording.")
    live_parser.add_argument("--file", required=True, help="Path to a real data CSV (columns: time_s, voltage_v).")
    live_parser.add_argument("--trim", type=float, default=5.0, help="Seconds to discard from each end for filter settling (default: 5).")

    args = parser.parse_args()

    if args.mode == "demo":
        run_demo()
    else:
        run_live(args.file, args.trim)


if __name__ == "__main__":
    main()
