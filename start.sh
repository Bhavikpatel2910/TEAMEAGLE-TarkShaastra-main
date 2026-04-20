#!/bin/bash

# 🚀 Quick Start Script for StampedeShield Prediction System
# This script starts all three services in the correct order

echo "🎯 Starting StampedeShield Prediction System..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${YELLOW}⚠️  Port $1 is already in use${NC}"
        return 1
    fi
    return 0
}

# Step 1: Start AI API
echo -e "${YELLOW}Step 1: Starting AI API (Port 5000)...${NC}"
if check_port 5000; then
    cd AI
    if [ ! -d "venv" ]; then
        echo "Creating Python virtual environment..."
        python -m venv venv
    fi

    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    else
        source venv/Scripts/activate  # Windows
    fi

    pip install -q -r requirements.txt 2>/dev/null
    python -m uvicorn api:app --reload --port 5000 > ../ai.log 2>&1 &
    AI_PID=$!
    echo -e "${GREEN}✅ AI API started (PID: $AI_PID)${NC}"
    sleep 2
    cd ..
else
    echo -e "${RED}❌ Could not start AI API - Port 5000 in use${NC}"
fi

echo ""

# Step 2: Start Backend
echo -e "${YELLOW}Step 2: Starting Backend (Port 3000)...${NC}"
if check_port 3000; then
    cd backend
    npm install -q 2>/dev/null
    npm start > ../backend.log 2>&1 &
    BACKEND_PID=$!
    echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"
    sleep 2
    cd ..
else
    echo -e "${RED}❌ Could not start Backend - Port 3000 in use${NC}"
fi

echo ""

# Step 3: Start Frontend
echo -e "${YELLOW}Step 3: Starting Frontend (Port 5500)...${NC}"
if check_port 5500; then
    cd frontend
    python -m http.server 5500 > ../frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
    cd ..
else
    echo -e "${RED}❌ Could not start Frontend - Port 5500 in use${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services started successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "📊 Service URLs:"
echo -e "  ${GREEN}Frontend:${NC}  http://localhost:5500/predictor.html"
echo -e "  ${GREEN}Backend:${NC}   http://localhost:3000"
echo -e "  ${GREEN}AI API:${NC}    http://localhost:5000"
echo ""
echo "📝 Logs:"
echo "  AI API:  tail -f ai.log"
echo "  Backend: tail -f backend.log"
echo "  Frontend: tail -f frontend.log"
echo ""
echo "⏹️  To stop all services, press Ctrl+C or run: killall python node"
echo ""

# Keep script running
wait
