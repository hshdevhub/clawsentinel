#!/usr/bin/env bash
# ClawBox — Hardened Docker deployment setup script
# ClawSentinel v0.1.0
#
# Usage: ./setup.sh
# Requires: Docker Desktop or Docker Engine + Compose v2

set -euo pipefail

CLAWBOX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAWSENTINEL_DATA_DIR="${HOME}/.clawsentinel"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║        ClawBox — Setup v0.1.0         ║"
echo "  ║   Hardened Docker deployment for      ║"
echo "  ║   OpenClaw + ClawSentinel              ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ─── Prerequisite checks ──────────────────────────────────────────────────────

check_docker() {
  if ! command -v docker &>/dev/null; then
    echo "  ✗ Docker not found. Install Docker Desktop from https://docker.com"
    exit 1
  fi

  if ! docker compose version &>/dev/null 2>&1; then
    echo "  ✗ Docker Compose v2 not found. Update Docker Desktop or install compose plugin."
    exit 1
  fi

  echo "  ✓ Docker $(docker --version | awk '{print $3}' | tr -d ',')"
  echo "  ✓ Docker Compose $(docker compose version --short)"
}

check_openclaw() {
  if ! command -v openclaw &>/dev/null; then
    echo "  ⚠  OpenClaw not found in PATH."
    echo "     ClawBox will still work if OpenClaw runs inside the container."
    echo "     For local OpenClaw, install it first: https://openclaw.ai"
    return 0
  fi
  echo "  ✓ OpenClaw detected at $(command -v openclaw)"
}

# ─── Data directory setup ─────────────────────────────────────────────────────

setup_directories() {
  mkdir -p "${CLAWSENTINEL_DATA_DIR}"/{logs,vault}
  chmod 700 "${CLAWSENTINEL_DATA_DIR}"
  chmod 700 "${CLAWSENTINEL_DATA_DIR}/vault"
  echo "  ✓ Data directory: ${CLAWSENTINEL_DATA_DIR}"
}

# ─── Pull images ──────────────────────────────────────────────────────────────

pull_images() {
  echo ""
  echo "  Pulling Docker images..."
  docker compose -f "${CLAWBOX_DIR}/docker-compose.yml" pull --quiet
  echo "  ✓ Images ready"
}

# ─── Start stack ──────────────────────────────────────────────────────────────

start_stack() {
  echo ""
  echo "  Starting ClawBox stack..."
  docker compose -f "${CLAWBOX_DIR}/docker-compose.yml" up -d

  echo ""
  echo "  Waiting for ClawGuard to be ready..."
  local retries=0
  while [ $retries -lt 30 ]; do
    if curl -sf http://127.0.0.1:18791/health &>/dev/null; then
      echo "  ✓ ClawGuard ready on :18790"
      break
    fi
    sleep 2
    retries=$((retries + 1))
  done

  if [ $retries -eq 30 ]; then
    echo "  ⚠  ClawGuard did not respond within 60s. Check: docker compose logs clawguard"
  fi
}

# ─── Summary ──────────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo "  ╔═══════════════════════════════════════╗"
  echo "  ║          ClawBox is running           ║"
  echo "  ╠═══════════════════════════════════════╣"
  echo "  ║                                       ║"
  echo "  ║  OpenClaw proxy:  ws://127.0.0.1:18790║"
  echo "  ║  ClawEye dashboard: http://localhost:7432║"
  echo "  ║                                       ║"
  echo "  ║  Point your OpenClaw clients to :18790║"
  echo "  ║  instead of :18789                    ║"
  echo "  ║                                       ║"
  echo "  ╚═══════════════════════════════════════╝"
  echo ""
  echo "  View logs:    docker compose -f ${CLAWBOX_DIR}/docker-compose.yml logs -f"
  echo "  Stop:         docker compose -f ${CLAWBOX_DIR}/docker-compose.yml down"
  echo "  Status:       clawsentinel status"
  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  check_docker
  check_openclaw
  setup_directories
  pull_images
  start_stack
  print_summary
}

main "$@"
