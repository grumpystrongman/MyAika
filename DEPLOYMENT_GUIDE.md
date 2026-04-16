# AIKA Avatar System - Production Deployment Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Local Development Deployment](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Performance Tuning](#performance-tuning)
7. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
8. [Security Best Practices](#security-best-practices)

## System Overview

The AIKA Avatar System is a production-ready emotion-driven avatar engine featuring:
- **Real-time emotion detection** from text input
- **Dynamic facial expression mapping** with 9 base expressions and 52 blendshape targets
- **Emotional voice synthesis** with prosody control (pitch, rate, energy, breathiness)
- **Lipsync generation** with 27 phoneme-to-viseme mappings
- **Idle continuous motion** (breathing, blinking, eye darts, head motion)
- **API-driven orchestration** for seamless integration
- **Session management** with audit logging and resource cleanup
- **Rate limiting & security** hardened for production use

### Architecture
```
┌─────────────────────┐
│  Client Application │
│   (Browser/App)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Express.js API     │  (avatarBridge)
│  /initialize        │
│  /interaction/*     │
│  /status            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Interaction Runtime │  (Full orchestration)
│  - Emotion Control  │
│  - Expression Mgmt  │
│  - Voice Synthesis  │
│  - Lipsync Gen      │
│  - Motion Control   │
└─────────────────────┘
```

## Pre-Deployment Checklist

### System Requirements
- **Node.js**: v20 or higher
- **Memory**: Minimum 2GB RAM (4GB recommended)
- **Disk**: 1GB for app + configs, separate storage for logs/cache
- **CPU**: 2+ cores recommended
- **Network**: Stable internet for TTS services (if cloud-based)

### Dependencies
```bash
# Required npm packages
npm list --depth=0
```

Key dependencies:
- express (4.18+) - Web framework
- fs, path (Node.js built-in) - File operations
- node:test (Node.js 18+) - Testing framework

### Configuration Preparation
1. Copy `.env.avatar.example` to `.env.avatar`
2. Configure TTS engine (piper/azure/elevenlabs)
3. Set rate limiting parameters
4. Configure logging paths
5. Enable optional services (Redis, Prometheus)

### File Permissions
```bash
# Ensure proper permissions on logs and config directories
chmod 755 logs config/avatar
chmod 644 config/avatar/*.json
chmod 755 .env.avatar  # Restrict env file access
```

## Local Development Deployment

### Quick Start
```bash
# Install dependencies
npm install

# Configure environment
cp .env.avatar.example .env.avatar
# Edit .env.avatar with local settings

# Run directly
node apps/server/src/avatar/index.js

# Or with process manager (PM2)
npm install -g pm2
pm2 start apps/server/src/avatar/index.js --name "aika-avatar"
pm2 save
```

### Development with Auto-Restart
```bash
# Using nodemon for auto-restart on file changes
npm install --save-dev nodemon
nodemon apps/server/src/avatar/index.js
```

### Testing Before Deployment
```bash
# Run comprehensive test suite
npm test

# Run specific test
node --test apps/server/tests/avatar_qa.test.js

# Expected: 46 tests passing, ~88ms runtime
```

## Docker Deployment

### Build Docker Image
```bash
# Build the avatar-specific image
docker build -f Dockerfile.avatar -t aika-avatar:1.0.0 .

# Tag for registry (e.g., DockerHub)
docker tag aika-avatar:1.0.0 myregistry/aika-avatar:1.0.0
docker push myregistry/aika-avatar:1.0.0
```

### Single Container Deployment
```bash
# Run standalone container
docker run -d \
  --name aika-avatar \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e TTS_ENGINE=piper \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/config/avatar:/app/config/avatar:ro \
  myregistry/aika-avatar:1.0.0

# Check health
docker ps
docker logs aika-avatar

# Stop container
docker stop aika-avatar
docker rm aika-avatar
```

### Docker Compose Deployment (Recommended)
```bash
# Start all services
docker-compose -f docker-compose.avatar.yml up -d

# View logs
docker-compose -f docker-compose.avatar.yml logs -f aika-avatar

# Stop services
docker-compose -f docker-compose.avatar.yml down

# Scale replicas (with load balancer)
docker-compose -f docker-compose.avatar.yml up -d --scale aika-avatar=3
```

### Environment Configuration in Docker
Create `.env.avatar` in project root:
```bash
NODE_ENV=production
TTS_ENGINE=piper
PIPER_URL=http://piper-service:8020
MAX_ACTIVE_SESSIONS=10
RATE_LIMIT_MAX_REQUESTS=100
```

Then in docker-compose:
```yaml
env_file:
  - .env.avatar
```

## Kubernetes Deployment

### Deploy with Helm (Recommended)
```bash
# Create namespace
kubectl create namespace aika

# Deploy
helm install aika-avatar ./helm/aika-avatar \
  --namespace aika \
  --values values-production.yaml

# Monitor
kubectl get pods -n aika
kubectl logs -f deployment/aika-avatar -n aika
```

### Manual Kubernetes Manifests
```yaml
# aika-avatar-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aika-avatar
  namespace: aika
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aika-avatar
  template:
    metadata:
      labels:
        app: aika-avatar
    spec:
      containers:
      - name: avatar
        image: myregistry/aika-avatar:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        - containerPort: 9090
          name: metrics
        env:
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - mountPath: /app/logs
          name: logs
        - mountPath: /app/config/avatar
          name: config
          readOnly: true
      volumes:
      - name: logs
        emptyDir: {}
      - name: config
        configMap:
          name: avatar-config
---
apiVersion: v1
kind: Service
metadata:
  name: aika-avatar
  namespace: aika
spec:
  selector:
    app: aika-avatar
  type: LoadBalancer
  ports:
  - port: 3000
    targetPort: 3000
    name: http
  - port: 9090
    targetPort: 9090
    name: metrics
```

Deploy:
```bash
kubectl apply -f aika-avatar-deployment.yaml
kubectl get svc -n aika aika-avatar
```

## Performance Tuning

### Cache Optimization
```javascript
// In .env.avatar
MAX_LIPSYNC_CACHE_SIZE=500  # Increase for higher traffic
CONVERSATION_CONTEXT_LENGTH=20
LIPSYNC_CACHE_TTL=3600000
```

### Request Queue Management
```javascript
TTS_REQUEST_QUEUE_SIZE=100  # Adjust based on concurrent users
TTS_REQUEST_TIMEOUT=30000   # Timeout for each request
```

### Load Balancing
```nginx
# nginx.conf
upstream aika_avatar {
    least_conn;
    server avatar-1:3000 weight=1 max_fails=3 fail_timeout=30s;
    server avatar-2:3000 weight=1 max_fails=3 fail_timeout=30s;
    server avatar-3:3000 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name avatar.api.example.com;
    
    location / {
        proxy_pass http://aika_avatar;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Rate limiting
        limit_req zone=api_limit burst=20 nodelay;
    }
}
```

## Monitoring & Troubleshooting

### Health Check Endpoint
```bash
# Check system health
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "healthy",
#   "uptime": 3600000,
#   "activeSessions": 2,
#   "metrics": {
#     "totalRequests": 150,
#     "successRate": 0.98,
#     "averageLatency": 45
#   }
# }
```

### Logging
```bash
# View logs
docker logs aika-avatar

# Tail logs
docker logs -f aika-avatar

# Check log file
tail -f logs/avatar.log
tail -f logs/avatar_audit.json
```

### Metrics Monitoring
```bash
# Prometheus metrics endpoint (if enabled)
curl http://localhost:9090/metrics

# Key metrics:
# - avatar_sessions_active
# - avatar_emotion_detection_duration_ms
# - avatar_tts_synthesis_duration_ms
# - avatar_lipsync_generation_duration_ms
# - avatar_api_requests_total
# - avatar_errors_total
```

### Performance Monitoring
```bash
# Check memory usage
docker stats aika-avatar

# Check CPU
docker stats --no-stream aika-avatar
```

### Common Issues & Solutions

#### Issue: High memory usage
```
Solution: Increase cache clearing frequency or reduce MAX_LIPSYNC_CACHE_SIZE
```

#### Issue: Slow TTS synthesis
```
Solution: Check TTS service availability, increase TTS timeouts, check network
```

#### Issue: Session timeout errors
```
Solution: Increase AVATAR_SESSION_TIMEOUT or verify client heartbeat
```

#### Issue: Rate limit errors
```
Solution: Adjust RATE_LIMIT_MAX_REQUESTS higher, implement request queuing
```

## Security Best Practices

### Input Validation
✅ All text inputs validated for length (max 5000 chars)
✅ Emotion values whitelisted
✅ Session IDs validated (alphanumeric + hyphens/underscores)

### Rate Limiting
✅ /initialize: 10 req/min per IP
✅ /interaction: 50 req/min per IP
✅ Configurable via environment variables

### Secrets Management
```bash
# Never commit .env.avatar
echo ".env.avatar" >> .gitignore

# Use secret management (e.g., HashiCorp Vault)
docker secret create avatar_config .env.avatar
```

### Network Security
```nginx
# Enable HTTPS
server {
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/avatar.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/avatar.example.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
}
```

### Audit Logging
```bash
# Audit logs are automatically created
ls -la logs/avatar_audit.json

# Review audit trail
jq '.entries[] | select(.timestamp > "2024-04-12")' logs/avatar_audit.json
```

## Deployment Verification

After deployment, verify all systems:

```bash
# 1. Health check
curl http://localhost:3000/health

# 2. Initialize session
curl -X POST http://localhost:3000/avatar/initialize \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-001","userId":"test-user"}'

# 3. Test emotion detection
curl -X POST http://localhost:3000/avatar/interaction/user-input \
  -H "Content-Type: application/json" \
  -d '{"userText":"I am very happy!","sessionId":"test-001"}'

# 4. Check metrics
curl http://localhost:9090/metrics | grep avatar_

# 5. Verify logging
tail -5 logs/avatar.log
```

## Rollback Procedure

If issues arise:
```bash
# Docker Compose
docker-compose -f docker-compose.avatar.yml down
docker-compose -f docker-compose.avatar.yml up -d

# Kubernetes
kubectl rollout undo deployment/aika-avatar -n aika
kubectl get rollout history deployment/aika-avatar -n aika

# Process Manager
pm2 restart aika-avatar
pm2 logs aika-avatar
```

## Support & Debugging

For issues:
1. Check logs: `docker logs aika-avatar`
2. Verify config: Check `.env.avatar` values
3. Test endpoints: Use curl or Postman
4. Review metrics: Check Prometheus dashboard
5. Check resource limits: `docker stats`

## Next Steps
- Set up CI/CD pipeline for automated deployments
- Configure automatic scaling (Kubernetes HPA or Docker Swarm)
- Enable distributed tracing (Jaeger/DataDog)
- Set up backup strategy for audit logs
- Configure CDN for model assets
