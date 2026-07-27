#!/usr/bin/env bash
# Double-click/terminal launcher for macOS and Linux: installs dependencies the first time
# (skipped on later runs once node_modules exists), then starts the dev server. Vite itself
# opens the browser automatically once the server is ready (see vite.config.mts's server.open).
# This file is meant to be shared alongside the whole project folder - it only works once
# copied to a computer that also has Node.js installed (https://nodejs.org).
#
# On macOS, double-clicking a .sh file usually opens it in a text editor rather than running
# it, unless "open with Terminal" has been set as the default - running it from a terminal
# (`./launch.sh`) always works: `chmod +x launch.sh` once if it's not already executable.

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on this computer."
  echo "Install it from https://nodejs.org (the LTS version), then run this script again."
  exit 1
fi

if [ ! -f .env ]; then
  echo "No .env file found - this project cannot start without one."
  echo "See README.md for the required configuration."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies - this only happens once and may take a few minutes..."
  npm install
fi

echo "Starting the Warren Bridge viewer..."
echo "Your browser will open automatically once it's ready."
echo "Press Ctrl+C to stop the app."
echo
npm start
