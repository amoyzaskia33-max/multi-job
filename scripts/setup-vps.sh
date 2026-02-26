#!/bin/bash
# SPIO Agent - VPS Setup Script (Ubuntu 22.04 LTS)
# Script otomatis untuk setup environment deployment
# Usage: bash setup-vps.sh

set -e

echo "=========================================="
echo "SPIO Agent - VPS Setup Script"
echo "=========================================="
echo ""

# Cek apakah dijalankan sebagai root
if [ "$EUID" -eq 0 ]; then
    echo "ERROR: Jangan jalankan script ini sebagai root!"
    echo "Jalankan sebagai user biasa, script akan meminta sudo jika diperlukan."
    exit 1
fi

# Cek OS
if [ ! -f /etc/os-release ]; then
    echo "ERROR: Tidak dapat mendeteksi OS"
    exit 1
fi

source /etc/os-release
if [ "$ID" != "ubuntu" ]; then
    echo "WARNING: Script ini dirancang untuk Ubuntu. OS terdeteksi: $ID"
    read -p "Lanjutkan? (y/n): " continue_choice
    if [ "$continue_choice" != "y" ]; then
        exit 1
    fi
fi

echo ""
echo "[1/8] Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo ""
echo "[2/8] Installing system dependencies..."
sudo apt install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    redis-server \
    nginx \
    git \
    curl \
    wget \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release

echo ""
echo "[3/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    echo "Docker installed successfully"
else
    echo "Docker already installed"
fi

echo ""
echo "[4/8] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose installed successfully"
else
    echo "Docker Compose already installed"
fi

# Tambahkan user ke docker group
echo ""
echo "[5/8] Adding user to docker group..."
if ! groups $USER | grep -q docker; then
    sudo usermod -aG docker $USER
    echo "User added to docker group. Logout dan login kembali untuk menerapkan."
else
    echo "User already in docker group"
fi

echo ""
echo "[6/8] Installing Node.js 20.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo "Node.js installed successfully"
else
    echo "Node.js already installed: $(node --version)"
fi

echo ""
echo "[7/8] Installing Poetry..."
if ! command -v poetry &> /dev/null; then
    curl -sSL https://install.python-poetry.org | python3 -
    export PATH="$HOME/.local/bin:$PATH"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    echo "Poetry installed successfully"
else
    echo "Poetry already installed: $(poetry --version)"
fi

echo ""
echo "[8/8] Configuring Redis..."
sudo systemctl start redis
sudo systemctl enable redis
if redis-cli ping | grep -q "PONG"; then
    echo "Redis is running"
else
    echo "WARNING: Redis tidak merespons"
fi

echo ""
echo "=========================================="
echo "Setup completed successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Logout dan login kembali untuk menerapkan docker group"
echo "2. Clone/upload project ke /opt/spio-agent"
echo "3. Copy file .env.example ke .env dan sesuaikan konfigurasi"
echo "4. Jalankan: docker-compose up -d --build"
echo ""
echo "Verification commands:"
echo "  docker --version"
echo "  docker-compose --version"
echo "  node --version"
echo "  npm --version"
echo "  python3 --version"
echo "  poetry --version"
echo "  redis-cli ping"
echo ""
