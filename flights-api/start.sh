#!/bin/bash

# Flights API Start Script
# Convenience script to start the server with virtual environment

cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Please run setup first: ./setup.sh"
    exit 1
fi

echo "🚀 Starting Flights API Server..."
source venv/bin/activate
python server.py
