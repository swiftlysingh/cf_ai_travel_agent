#!/bin/bash

# Flights API Setup Script
# This script creates a virtual environment and installs dependencies

set -e

echo "🚀 Setting up Flights API..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the server:"
echo "  cd flights-api"
echo "  source venv/bin/activate"
echo "  python server.py"
echo ""
echo "Or use the convenience script:"
echo "  ./flights-api/start.sh"
