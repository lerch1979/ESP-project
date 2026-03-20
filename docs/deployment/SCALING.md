# Scaling Guide — HR-ERP Workforce Stability Platform

## Architecture Overview

```
                    ┌─────────────┐
                    │   Ingress   │
                    │  (nginx)    │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐   ┌──────────▼──────────┐
    │  Backend Service   │   │   Admin Service     │
    │  (3-10 pods, HPA)  │   │   (2 pods)          │
    └─────────┬─────────┘   └─────────────────────┘
              │
     ┌────────┴────────┐
     │                  │
┌────▼────┐      ┌─────▼─────┐
│ Postgres │      │   Redis   │
│ (1 pod)  │      │  (1 pod)  │
└──────────┘      └───────────┘
```

## Services

| Service    | Min Pods | Max Pods | Auto-Scale | Storage  |
|------------|----------|----------|------------|----------|
| Backend    | 3        | 10       | HPA        | —        |
| Admin UI   | 2        | 2        | —          | —        |
| PostgreSQL | 1        | 1        | —          | 20Gi PVC |
| Redis      | 1        | 1        | —          | 5Gi PVC  |
| Prometheus | 1        | 1        | —          | emptyDir |
| Grafana    | 1        | 1        | —          | emptyDir |

## Auto-Scaling Triggers (Backend HPA)

| Metric | Threshold | Action      |
|--------|-----------|-------------|
| CPU    | > 70%     | Scale up    |
| Memory | > 80%     | Scale up    |

- **Scale up**: max 2 pods per 60s
- **Scale down**: max 1 pod per 120s (5-min stabilization)

## Manual Scaling

```bash
# Scale backend
kubectl scale deployment backend --replicas=5 -n hr-erp-production

# Scale admin
kubectl scale deployment admin --replicas=3 -n hr-erp-production

# Check current state
kubectl get hpa -n hr-erp-production
kubectl top pods -n hr-erp-production
```

## Deployment

### Prerequisites
- Kubernetes cluster (1.25+)
- kubectl configured
- cert-manager (for TLS)
- nginx-ingress controller

### Deploy from scratch
```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create secrets (edit first!)
kubectl apply -f k8s/secrets.yaml

# 3. Deploy infrastructure
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/persistent-volumes.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml

# 4. Deploy application
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/admin-deployment.yaml
kubectl apply -f k8s/ingress.yaml

# 5. Deploy monitoring
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/grafana.yaml

# 6. Apply network policies
kubectl apply -f k8s/network-policy.yaml

# 7. Verify
kubectl get all -n hr-erp-production
```

### Local Development (Docker Compose)
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

## Monitoring

| Tool       | URL                              | Purpose               |
|------------|----------------------------------|------------------------|
| Prometheus | http://prometheus-service:9090   | Metrics collection    |
| Grafana    | http://grafana-service:3000      | Dashboards & alerts   |

### Alert Rules
- **HighCPU**: CPU > 80% for 5 minutes
- **HighMemory**: Memory > 800MB for 5 minutes
- **PodRestart**: > 3 restarts in 1 hour

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. **Test** — runs on every push/PR
2. **Build & Push** — builds Docker images, pushes to GHCR (main only)
3. **Deploy** — applies K8s manifests with new image tags (main only)

### Required GitHub Secrets
- `KUBE_CONFIG` — base64-encoded kubeconfig
- `GITHUB_TOKEN` — auto-provided for GHCR

## Network Security

Network policies restrict pod-to-pod traffic:
- Backend → Postgres (5432), Redis (6379), DNS
- Admin → Backend (3001)
- Postgres — only accepts from Backend
- Redis — only accepts from Backend

## Disaster Recovery

1. **Database backups**: Configure `pg_dump` CronJob (daily)
2. **Point-in-time recovery**: PostgreSQL WAL archiving (7 days)
3. **Redis**: AOF persistence enabled, recovers on restart
4. **Secrets**: Store in external secret manager (Vault/AWS SSM)

## Capacity Planning

| Users       | Backend Pods | Postgres | Redis  |
|-------------|-------------|----------|--------|
| < 500       | 3           | 1 pod    | 512MB  |
| 500-1,000   | 5           | 1 pod    | 1GB    |
| 1,000-3,000 | 7-8         | Read replica | 2GB |
| 3,000+      | 10          | PgBouncer + replicas | Cluster |
