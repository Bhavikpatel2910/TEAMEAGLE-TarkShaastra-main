#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         STAMPEDE PREDICTOR - SYSTEM VERIFICATION             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

BACKEND_URL="http://localhost:5001/api"
PASS=0
FAIL=0

# Test 1: Health Check
echo "🔍 Test 1: Backend Health Check"
if curl -s "$BACKEND_URL/health" | grep -q '"status":"ok"'; then
    echo "   ✅ Backend responding"
    ((PASS++))
else
    echo "   ❌ Backend not responding"
    ((FAIL++))
fi

# Test 2: Login
echo "🔍 Test 2: Authentication"
LOGIN_RESPONSE=$(curl -s -X POST "$BACKEND_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}')
if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
    echo "   ✅ Login working"
    ((PASS++))
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
else
    echo "   ❌ Login failed"
    ((FAIL++))
fi

# Test 3: Corridors Endpoint
echo "🔍 Test 3: Corridors API"
if curl -s "$BACKEND_URL/corridors" | grep -q '^\['; then
    echo "   ✅ Corridors endpoint working"
    ((PASS++))
else
    echo "   ❌ Corridors endpoint failed"
    ((FAIL++))
fi

# Test 4: Create Corridor
echo "🔍 Test 4: Create Corridor"
CORRIDOR_RESPONSE=$(curl -s -X POST "$BACKEND_URL/corridors" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test-'$(date +%s)'",
    "width":6,
    "length":50,
    "capacity":500
  }')
if echo "$CORRIDOR_RESPONSE" | grep -q '"id"'; then
    echo "   ✅ Corridor creation working"
    ((PASS++))
    CORRIDOR_ID=$(echo "$CORRIDOR_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
else
    echo "   ❌ Corridor creation failed"
    ((FAIL++))
fi

# Test 5: Predictions
echo "🔍 Test 5: Prediction Engine"
PRED_RESPONSE=$(curl -s -X POST "$BACKEND_URL/predictions" \
  -H "Content-Type: application/json" \
  -d '{
    "entry_flow_rate_pax_per_min":15,
    "exit_flow_rate_pax_per_min":8,
    "queue_density_pax_per_m2":4,
    "corridor_width_m":6,
    "vehicle_count":3,
    "transport_arrival_burst":2,
    "weather":"rain",
    "festival_peak":1
  }')
if echo "$PRED_RESPONSE" | grep -q '"pressure_index"'; then
    echo "   ✅ Prediction engine working"
    ((PASS++))
else
    echo "   ❌ Prediction engine failed"
    ((FAIL++))
fi

# Test 6: Alerts
echo "🔍 Test 6: Alerts API"
if curl -s "$BACKEND_URL/alerts" | grep -q '^\['; then
    echo "   ✅ Alerts endpoint working"
    ((PASS++))
else
    echo "   ❌ Alerts endpoint failed"
    ((FAIL++))
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    TEST RESULTS                              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Passed: $PASS"
echo "❌ Failed: $FAIL"
echo "📊 Total:  $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED! System is fully functional."
    echo ""
    echo "🌐 Access frontend at: http://localhost:5500/index.html"
    exit 0
else
    echo "⚠️  Some tests failed. Check that:"
    echo "   1. Backend is running: cd backend && npm start"
    echo "   2. Port 5001 is available"
    echo "   3. Check TROUBLESHOOTING.md for help"
    exit 1
fi
