#!/bin/bash
# run.sh - Start A.I.D.E. on Raspberry Pi

echo "🚑 Starting A.I.D.E. on Raspberry Pi..."
cd /home/pi/AIDE_Updated/BACKEND

# Install dependencies if needed
# pip install -r requirements.txt

# Start the server
python3 app.py