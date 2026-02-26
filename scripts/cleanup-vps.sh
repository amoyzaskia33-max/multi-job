#!/bin/bash
# SPIO Agent - VPS Cleanup Script
# Script untuk reset/cleanup deployment sebelumnya

set -e

echo "=========================================="
echo "SPIO Agent - VPS Cleanup Script"
echo "=========================================="
echo ""

# Confirm
echo "⚠️  WARNING: This will remove ALL SPIO Agent data!"
echo ""
read -p "Are you sure? Type 'YES' to confirm: " confirm
if [ "$confirm" != "YES" ]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo ""
echo "[1/6] Stopping Docker containers..."
if command -v docker-compose &> /dev/null; then
    cd /opt/spio-agent 2>/dev/null && docker-compose down 2>/dev/null || true
fi
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true

echo ""
echo "[2/6] Removing Docker images..."
docker rmi $(docker images -q) 2>/dev/null || true

echo ""
echo "[3/6] Removing Docker volumes..."
docker volume prune -f

echo ""
echo "[4/6] Stopping systemd services..."
sudo systemctl stop spio-api spio-worker spio-scheduler spio-connector spio-ui 2>/dev/null || true
sudo systemctl disable spio-api spio-worker spio-scheduler spio-connector spio-ui 2>/dev/null || true

echo ""
echo "[5/6] Removing service files..."
sudo rm -f /etc/systemd/system/spio-*.service 2>/dev/null || true
sudo systemctl daemon-reload

echo ""
echo "[6/6] Removing project folder..."
sudo rm -rf /opt/spio-agent

echo ""
echo "=========================================="
echo "✅ Cleanup completed successfully!"
echo "=========================================="
echo ""
echo "VPS is now clean. You can deploy fresh."
echo ""
echo "Next steps:"
echo "1. cd /opt"
echo "2. git clone <repository-url> spio-agent"
echo "3. cd spio-agent"
echo "4. cp .env.example .env"
echo "5. Edit .env with your configuration"
echo "6. docker-compose -f docker-compose.prod.yml up -d"
echo ""
