import argparse
import csv
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import butter, sosfiltfilt

#Workflow is as follows:
# Mode will switch between test data demo and live data.
# Mean will be subtracted out to remove DC component
# FFT will be preformed in incrememnts of 30 seconds and plotted in real time.
# Plots will follow the same format as everything else, they will have the time history option.

# Path.__file__.parent means "the folder this script itself lives in" - so this works no
# matter which directory you happen to run the command from (unlike a bare relative string,
# which is relative to your CURRENT directory, not the script's location).

def run_demo():
    DATA_PATH = Path(__file__).parent / "sample_data.csv"
    SAMPLE_RATE = 100 #hz

    df = pd.read_csv(DATA_PATH)
    acceleration = df["acceleration"]
    #print(acceleration)

    time = df["time_s"]

    mean = np.mean(acceleration)
    DC_removed = acceleration - mean
    #print(DC_removed)

    FFT = np.fft.rfft(DC_removed)
    FFT = abs(FFT)
    #print(FFT)

    freq = np.fft.rfftfreq(len(DC_removed), d=1/SAMPLE_RATE)

    fig, axes = plt.subplots(2, 1, figsize=(10, 9))
    axes[0].set_title("Acceleration Data")
    axes[0].plot(time, acceleration, label="acceleration", color="red", linewidth=1)
    axes[0].set_ylabel("in/s^2")
    axes[0].legend(loc="upper right")

    axes[1].set_title("FFT of Acceleration Data")
    axes[1].plot(freq, FFT, label="FFT", color="blue", linewidth=1)
    axes[1].set_xlabel("hz")
    axes[1].legend(loc="upper right")
    fig.tight_layout()
    plt.show()


run_demo()




##----------------------------------------------------------------------------------##
##--------------------------------Setting up Mode switch----------------------------##
##----------------------------------------------------------------------------------##

# def main():
#     parser = argparse.ArgumentParser(description="Geophone displacement recovery - demo (synthetic) or live (real data) mode.")
#     subparsers = parser.add_subparsers(dest="mode", required=True)

#     subparsers.add_parser("demo", help="Run the synthetic validation test (no file needed).")

#     live_parser = subparsers.add_parser("live", help="Process a real recording.")
#     live_parser.add_argument("--file", required=True, help="Path to a real data CSV (columns: time_s, voltage_v).")
#     live_parser.add_argument("--trim", type=float, default=5.0, help="Seconds to discard from each end for filter settling (default: 5).")

#     args = parser.parse_args()

#     if args.mode == "demo":
#         run_demo()
#     else:
#         run_live(args.file, args.trim)


# if __name__ == "__main__":
#     main()
