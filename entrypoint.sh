#!/bin/bash

set -e

echo "🔧 Starting server..."
node server.js &

echo "👷 Starting worker..."
node worker.js