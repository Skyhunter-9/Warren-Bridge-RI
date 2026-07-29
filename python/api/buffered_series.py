"""
Generic persistent-buffer + processing-pipeline helper shared by every "result script"
endpoint in main.py - see that file's module docstring for the full "how to add a new script"
recipe. In short: every endpoint needs a persistent, append-only buffer of raw samples (so
overlapping polls of an unseeded synthetic generator don't make already-displayed history
silently rewrite itself - this is exactly the bug the geophone endpoint had at first), trimmed
for filter/processing settle-in, and downsampled for charting. That part is identical for every
script; only WHAT gets generated and WHAT processing runs on it differs. This class is the
shared part, so a new script only has to supply two functions.
"""

import time
from typing import Callable

import numpy as np


class BufferedSeries:
    """
    generate(end_time, window_seconds) -> (t, raw)
        Fabricates/reads new raw samples covering [end_time - window_seconds, end_time].
        Called only with whatever time range is new since the last poll (or
        initial_window_seconds on the very first call) - never re-asked for a time range
        already covered, so it's safe for `generate` to be non-deterministic (e.g. random
        noise) without old data changing on a later poll.

    process(t, raw) -> {name: array}
        Turns the FULL current buffer into one or more named output series, each the same
        length as `t` (e.g. {"trapezoidalIn": ..., "simpsonsIn": ...}). Whatever keys this
        returns become the point fields the frontend charts - see ProcessingLineChart.tsx's
        `lines` prop, which just needs matching `dataKey`s.
    """

    def __init__(
        self,
        generate: Callable[[float, float], tuple[np.ndarray, np.ndarray]],
        process: Callable[[np.ndarray, np.ndarray], dict],
        sample_rate_hz: float,
        max_buffer_seconds: float = 3600.0,
        trim_seconds: float = 5.0,
        initial_window_seconds: float = 60.0,
    ):
        self._generate = generate
        self._process = process
        self.sample_rate_hz = sample_rate_hz
        self._max_buffer_seconds = max_buffer_seconds
        self._trim_seconds = trim_seconds
        self._initial_window_seconds = initial_window_seconds

        self._t = np.array([])
        self._raw = np.array([])
        self._last_generated_time: float | None = None

    def _extend(self, now: float) -> None:
        start = self._last_generated_time if self._last_generated_time is not None else now - self._initial_window_seconds
        if now > start:
            t_new, raw_new = self._generate(now, now - start)
            self._t = np.concatenate([self._t, t_new])
            self._raw = np.concatenate([self._raw, raw_new])
            self._last_generated_time = now

        # Cap memory/CPU (same idea as sensorDataStore.ts's MAX_HISTORY=5000) - "last 1 Year"/
        # "all time" on the TS timeframe dropdown will just show whatever's within this cap,
        # the same honest limitation the rest of the dashboard already has.
        cutoff = now - self._max_buffer_seconds
        keep = self._t >= cutoff
        self._t = self._t[keep]
        self._raw = self._raw[keep]

    def poll(self) -> dict:
        """Advances the buffer to "now", runs `process` on it, and returns a
        {"sampleRateHz": ..., "points": [...]} dict ready to return directly from a FastAPI
        route."""
        now = time.time()
        self._extend(now)

        min_samples = int(self.sample_rate_hz * (2 * self._trim_seconds + 1))
        if len(self._t) < min_samples:
            return {"sampleRateHz": self.sample_rate_hz, "points": []}

        outputs = self._process(self._t, self._raw)

        keep = (self._t >= self._t[0] + self._trim_seconds) & (self._t <= self._t[-1] - self._trim_seconds)
        t_kept = self._t[keep]
        kept_outputs = {name: values[keep] for name, values in outputs.items()}

        step = max(1, int(self.sample_rate_hz))  # ~1 point/second out, matching the dashboard
        points = [
            {
                "timestamp": int(t_kept[i] * 1000),
                "time": time.strftime("%H:%M:%S", time.localtime(t_kept[i])),
                **{name: round(float(values[i]), 5) for name, values in kept_outputs.items()},
            }
            for i in range(0, len(t_kept), step)
        ]

        return {"sampleRateHz": self.sample_rate_hz, "points": points}
