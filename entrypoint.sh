#!/bin/bash

# Start the server in the background
node server.js &

# Start the worker in the foreground so the container stays alive
node worker.js