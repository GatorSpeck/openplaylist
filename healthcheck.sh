#!/bin/bash
set -e

# Check if backend API is responding
if ! curl -s -f http://localhost/api/health > /dev/null; then
  echo "Backend API health check failed"
  exit 1
fi

# Check if frontend is being served properly
if ! curl -s -f http://localhost/ | grep -q "<div id=\"root\">"; then
  echo "Frontend health check failed"
  exit 1
fi

echo "All services are healthy"
exit 0