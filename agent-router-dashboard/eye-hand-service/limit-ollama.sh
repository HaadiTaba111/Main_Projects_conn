#!/usr/bin/env bash
# محدودکردن RAM/CPU سرویس Ollama در سطح سیستم (systemd drop-in)
# استفاده: sudo bash limit-ollama.sh [MemoryMax مثل 6G] [CPUQuota مثل 300%]
set -e
MEM="${1:-6G}"; CPU="${2:-300%}"
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/limits.conf <<EOF
[Service]
MemoryHigh=$(( ${MEM%G} * 9 / 10 ))G
MemoryMax=$MEM
CPUQuota=$CPU
EOF
systemctl daemon-reload && systemctl restart ollama || true
echo "✅ Ollama محدود شد: RAM تا $MEM ، CPU تا $CPU"
systemctl show ollama -p MemoryMax -p CPUQuota 2>/dev/null || true
