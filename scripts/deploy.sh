#!/bin/bash
# SPIO Agent - Quick Deploy Script
# Script untuk quick deployment setelah setup awal selesai
# Usage: bash deploy.sh

set -e

echo "=========================================="
echo "SPIO Agent - Quick Deploy Script"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Cek apakah .env sudah ada
if [ ! -f .env ]; then
    echo "ERROR: File .env tidak ditemukan!"
    echo "Silakan copy .env.example ke .env dan sesuaikan konfigurasi."
    echo "  cp .env.example .env"
    exit 1
fi

# Cek apakah docker-compose.prod.yml sudah ada
if [ ! -f docker-compose.prod.yml ]; then
    echo "ERROR: File docker-compose.prod.yml tidak ditemukan!"
    exit 1
fi

echo "[1/4] Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

echo ""
echo "[2/4] Building containers..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo ""
echo "[3/4] Starting services..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "[4/4] Waiting for services to be healthy..."
sleep 10

# Cek health API
echo ""
echo "Checking API health..."
if curl -f -s http://localhost:8000/healthz > /dev/null; then
    echo "✓ API is healthy"
else
    echo "✗ API is not responding yet. Check logs with: docker-compose logs api"
fi

# Cek UI
echo ""
echo "Checking UI..."
if curl -f -s http://localhost:3000 > /dev/null; then
    echo "✓ UI is accessible"
else
    echo "✗ UI is not responding yet. Check logs with: docker-compose logs ui"
fi

# Cek Redis
echo ""
echo "Checking Redis..."
if docker exec spio-redis redis-cli ping | grep -q "PONG"; then
    echo "✓ Redis is running"
else
    echo "✗ Redis is not responding"
fi

echo ""
echo "=========================================="
echo "Deployment completed!"
echo "=========================================="
echo ""
echo "Service URLs:"
echo "  API:  http://localhost:8000"
echo "  UI:   http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  docker-compose -f docker-compose.prod.yml ps       # Status"
echo "  docker-compose -f docker-compose.prod.yml logs -f  # Logs"
echo "  docker-compose -f docker-compose.prod.yml restart  # Restart"
echo "  docker-compose -f docker-compose.prod.yml down     # Stop"
echo ""
