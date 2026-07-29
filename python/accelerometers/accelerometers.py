import argparse
import csv

import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import butter, sosfiltfilt

#Workflow is as follows:
# Mode will switch between test data demo and live data.
# Mean will be subtracted out to remove DC component
# FFT will be preformed in incrememnts of 30 seconds and plotted in real time.
# Plots will follow the same format as everything else, they will have the time history option.

def run_live(filepath, trim_seconds):
    spaceholder = 1



def run_demo():
    spaceholder = 1



##----------------------------------------------------------------------------------##
##--------------------------------Setting up Mode switch----------------------------##
##----------------------------------------------------------------------------------##

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
