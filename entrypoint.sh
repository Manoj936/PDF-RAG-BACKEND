#!/bin/bash

# Exit on error
set -e

# Start the server in the background
node server.js &

# Start the worker in the foreground (to keep container running)
node worker.js
