"""
FastAPI service exposing "result script" processing pipelines over HTTP, so the TypeScript
dashboard fetches already-processed, chart-ready numbers instead of raw samples - the browser
never sees a raw 100Hz signal, only the finished result. This is this app's established "REAL
mode vendor endpoint" pattern (see SensorService.ts/radarService.ts), just running as an actual
process instead of an imagined vendor box.

Run it with (from the python/ directory, with the venv active):
    uvicorn api.main:app --reload --port 8000

Then check it's alive:
    curl http://localhost:8000/geophone-displacement


HOW TO ADD A NEW RESULT SCRIPT
-------------------------------
1. Write your processing script under python/ (e.g. python/accelerometertest/fft.py),
   following geophonetest/displacement.py's pattern - most importantly a
   `generate_live_window(end_time, window_seconds)` function producing (t, raw_samples), plus
   whatever compute functions you need (see displacement.py's demo/live CLI modes for how to
   validate that math *before* wiring it in here).

2. Down here, write one small `process(t, raw)` function that calls those compute functions on
   the FULL current buffer and returns a dict of named output arrays, each the same length as
   `t` - see `_process_geophone` below. Then instantiate a `BufferedSeries(generate=...,
   process=..., sample_rate_hz=...)` and add a `@app.get("/your-endpoint")` route that just
   calls `.poll()` - see `geophone_series`/`get_geophone_displacement` below. That's the whole
   Python side; BufferedSeries (buffered_series.py) handles the buffer/trim/downsample
   boilerplate for you.

3. On the TS side: one line in a new src/<sensor>/xStore.ts
   (`createProcessingStore("/your-endpoint")`), and a small chart component using
   `<ProcessingLineChart lines={[...]} />` - see src/geophone/ for the exact pattern to copy.
   Then render that chart in ProcessedResultsDashboard.tsx.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.buffered_series import BufferedSeries
from geophonetest.displacement import (
    SAMPLE_RATE_HZ as GEOPHONE_SAMPLE_RATE_HZ,
    generate_live_window,
    highpass_filter,
    integrate_simpsons,
    integrate_trapezoidal,
)

app = FastAPI(title="Warren Bridge Signal Processing API")

# Dev-only convenience - the Vite dev server (localhost:3000) and this API (localhost:8000)
# are different origins, so the browser blocks the fetch without CORS headers. Lock
# allow_origins down to the real deployed frontend URL before this ever runs anywhere but a
# developer's own machine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"service": "signal-processing-api", "status": "ok"}


# ---------------------------------------------------------------------------
# Geophone displacement - python/geophonetest/displacement.py
# ---------------------------------------------------------------------------

def _process_geophone(t, velocity):
    filtered_velocity = highpass_filter(velocity, GEOPHONE_SAMPLE_RATE_HZ)
    trapezoidal = integrate_trapezoidal(filtered_velocity, t)
    simpsons = integrate_simpsons(filtered_velocity, t)
    # Demeaned - a high-pass filter recovers motion SHAPE, not absolute position, so
    # "displacement" is always relative to its own baseline - see displacement.py's
    # rmse_shape()/run_live() for the full reasoning.
    return {
        "trapezoidalIn": trapezoidal - trapezoidal.mean(),
        "simpsonsIn": simpsons - simpsons.mean(),
    }


geophone_series = BufferedSeries(
    generate=generate_live_window,
    process=_process_geophone,
    sample_rate_hz=GEOPHONE_SAMPLE_RATE_HZ,
)


@app.get("/geophone-displacement")
def get_geophone_displacement():
    return geophone_series.poll()


# ---------------------------------------------------------------------------
# Add new result scripts below this line, following the same pattern:
#   1. def _process_yourscript(t, raw): ... return {"fieldName": array, ...}
#   2. yourscript_series = BufferedSeries(generate=..., process=_process_yourscript, sample_rate_hz=...)
#   3. @app.get("/your-endpoint") \n def get_yourscript(): return yourscript_series.poll()
# ---------------------------------------------------------------------------
