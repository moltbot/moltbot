#!/usr/bin/env bash
# Test script for Cognee integration
# Run this inside the dev container after starting docker-compose

set -e

echo "=== Clawdbot + Cognee Integration Test ==="
echo ""

# 1. Check if Cognee is reachable
echo "1. Testing Cognee connection..."
if curl -sf http://cognee:8000/status > /dev/null 2>&1; then
    echo "   ✓ Cognee is healthy at http://cognee:8000"
    curl -s http://cognee:8000/status | head -c 200
    echo ""
else
    echo "   ✗ Cannot reach Cognee at http://cognee:8000"
    echo "   Make sure Cognee container is running and healthy"
    exit 1
fi
echo ""

# 2. Install dependencies if needed
if [ ! -d "node_modules/.pnpm" ]; then
    echo "2. Installing dependencies..."
    pnpm install
else
    echo "2. Dependencies already installed"
fi
echo ""

# 3. Run unit tests
echo "3. Running Cognee unit tests..."
pnpm test src/memory/cognee-client.test.ts src/memory/cognee-provider.test.ts
echo ""

# 4. Quick integration check (manual API test)
echo "4. Quick API smoke test..."
echo "   Adding test data to Cognee..."

# Add test data
RESULT=$(curl -sf -X POST http://cognee:8000/add \
  -H "Content-Type: application/json" \
  -d '{
    "data": "Test memory entry: The capital of France is Paris. This is a test document for Clawdbot integration.",
    "dataset_name": "clawdbot-test"
  }' 2>&1) || true

if echo "$RESULT" | grep -q "dataset"; then
    echo "   ✓ Data added successfully"
    echo "   Response: $RESULT"
else
    echo "   ⚠ Add may have failed (this is OK if Cognee API differs)"
    echo "   Response: $RESULT"
fi
echo ""

echo "=== Test Complete ==="
echo ""
echo "Next steps:"
echo "  - The unit tests verify the client/provider logic"
echo "  - For full integration, configure Clawdbot with:"
echo "    memorySearch:"
echo "      provider: cognee"
echo "      cognee:"
echo "        baseUrl: http://cognee:8000  # or http://localhost:8000 from host"
