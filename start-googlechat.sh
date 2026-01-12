#!/bin/bash
# Start Clawdbot Google Chat Integration
# Run this script after restarting your computer

cd "$(dirname "$0")"

echo "Starting Clawdbot Google Chat..."
echo ""

# Kill any existing processes
pkill -f "ngrok http 18792" 2>/dev/null
pkill -f "run-webhook" 2>/dev/null
sleep 1

# Start ngrok in background
echo "1. Starting ngrok tunnel..."
ngrok http 18792 > /tmp/ngrok.log 2>&1 &
sleep 4

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "   ERROR: ngrok failed to start. Check your internet connection."
    exit 1
fi

echo "   ngrok URL: $NGROK_URL"
echo ""

# Start webhook server
echo "2. Starting webhook server..."
npx tsx src/googlechat/run-webhook.ts > /tmp/googlechat-webhook.log 2>&1 &
sleep 3

# Verify webhook is running
if lsof -i :18792 > /dev/null 2>&1; then
    echo "   Webhook running on port 18792"
else
    echo "   ERROR: Webhook failed to start"
    exit 1
fi

echo ""
echo "=========================================="
echo "Clawdbot Google Chat is READY!"
echo "=========================================="
echo ""
echo "Webhook URL: ${NGROK_URL}/webhook/googlechat"
echo ""
echo "NOTE: If the ngrok URL changed, update it in Google Chat:"
echo "  https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat"
echo ""
echo "Logs: tail -f /tmp/googlechat-webhook.log"
echo ""
echo "To stop: pkill -f ngrok && pkill -f run-webhook"
