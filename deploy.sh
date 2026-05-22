#!/usr/bin/env bash

set -euo pipefail

source backend/.env

SWR_ADDRESS="${SWR_ADDRESS:-swr.ap-southeast-1.myhuaweicloud.com}"
SWR_ORG="${SWR_ORG:-coolingops}"
ECS_IP="${ECS_IP:-YOUR_ECS_IP}"
ECS_USER="${ECS_USER:-root}"

BACKEND_IMAGE="$SWR_ADDRESS/$SWR_ORG/coolingops-backend:latest"
FRONTEND_IMAGE="$SWR_ADDRESS/$SWR_ORG/coolingops-frontend:latest"

docker login -u "AP-SOUTHEAST-1@$HUAWEI_AK" -p "$HUAWEI_SK" "$SWR_ADDRESS"

docker build -t backend ./backend
docker build -t frontend ./frontend

docker tag backend "$BACKEND_IMAGE"
docker tag frontend "$FRONTEND_IMAGE"

docker push "$BACKEND_IMAGE"
docker push "$FRONTEND_IMAGE"

ssh "$ECS_USER@$ECS_IP" <<EOF
docker pull $BACKEND_IMAGE
docker stop coolingops-backend || true
docker rm coolingops-backend || true
docker run -d --name coolingops-backend \
  -p 8000:8000 \
  -v /app/data:/app/data \
  -e HUAWEI_AK="$HUAWEI_AK" \
  -e HUAWEI_SK="$HUAWEI_SK" \
  -e SMN_TOPIC_URN="$SMN_TOPIC_URN" \
  --restart unless-stopped \
  $BACKEND_IMAGE
EOF
