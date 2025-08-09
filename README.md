# AgroFlow - Evaluación Conjunta (Arquitectura de Software)

> **Checklist rápido (lo mínimo para aprobar):**
> 1) CRUDs: Agricultores + Cosechas (central), Insumos (inventario).  
> 2) Mensajería: publicar `cosechas.nueva` desde central; consumir en inventario y facturación.  
> 3) Facturación: calcular y guardar factura; `PUT /cosechas/{id}/estado` en central.  
> 4) Docker: 3 Dockerfiles + subir a Docker Hub con tags (`v1.0`, `latest`).  
> 5) Kubernetes: Secrets, ConfigMaps, PVCs, Deployments, Services, Ingress.  
> 6) Validación E2E: `POST /cosechas` ⇒ se genera factura ⇒ estado de cosecha = FACTURADA.

## Estructura
```
agroflow_evaluacion_conjunta/
├─ central/
├─ inventario/
├─ facturacion/
├─ db-init/
├─ k8s/
└─ docker-compose.yml
```

## Variables de entorno (ejemplo)
Crea un archivo `.env` en cada servicio copiando de `.env.example` y ajustando si es necesario.

## Pasos local con Docker Compose
```bash
# 1) Arrancar infraestructura + servicios
docker compose up -d --build

# 2) Ver colas Rabbit (opcional)
# URL: http://localhost:15672  (user: guest / pass: guest)

# 3) CRUD Agricultores (Central)
curl -s -X POST http://localhost:3001/agricultores -H "Content-Type: application/json" -d '{"nombre":"Juan Pérez","finca":"La Esperanza","ubicacion":"9.7489°N,83.7534°W","correo":"juan@example.com"}' | jq
# Copia el id que retorna
AGRICULTOR_ID="<pega_id>"

# 4) Registrar Cosecha (Central → publica evento)
curl -s -X POST http://localhost:3001/cosechas -H "Content-Type: application/json" -d '{"agricultor_id":"'"$AGRICULTOR_ID"'","producto":"Arroz Oro","toneladas":12.5,"ubicacion":"9.7489°N,83.7534°W"}' | jq
# Espera ~2-5s a que consuman inventario y facturación

# 5) Ver Cosecha (debe tener estado FACTURADA y factura_id no nulo)
# Reemplaza <COSECHA_ID> con el id devuelto en el paso anterior
curl -s http://localhost:3001/cosechas/<COSECHA_ID> | jq

# 6) CRUD Insumos (Inventario)
curl -s -X POST http://localhost:3002/insumos -H "Content-Type: application/json" -d '{"nombre":"Semilla Arroz L-23","stock":500}' | jq
curl -s -X POST http://localhost:3002/insumos -H "Content-Type: application/json" -d '{"nombre":"Fertilizante N-PK","stock":200}' | jq
curl -s http://localhost:3002/insumos | jq

# 7) Facturas (MariaDB, vía API de facturación)
curl -s http://localhost:3003/facturas | jq
```

## Pasos en Kubernetes (minikube o cluster real)
> Requiere un Ingress Controller (por ejemplo, `minikube addons enable ingress`).

```bash
# 1) Namespace
kubectl apply -f k8s/namespace.yaml

# 2) Secrets/ConfigMap
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# 3) Volúmenes + DBs + RabbitMQ
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/mysql.yaml
kubectl apply -f k8s/mariadb.yaml
kubectl apply -f k8s/rabbitmq.yaml

# Espera a que los pods estén Ready
kubectl get pods -n agroflow -w

# 4) Servicios de negocio
kubectl apply -f k8s/central.yaml
kubectl apply -f k8s/inventario.yaml
kubectl apply -f k8s/facturacion.yaml

# 5) Ingress
kubectl apply -f k8s/ingress.yaml

# 6) Probar (usa /etc/hosts: 127.0.0.1 central.local inventario.local facturacion.local)
curl -s -X POST http://central.local/cosechas -H "Content-Type: application/json" -d '{"agricultor_id":"<uuid>","producto":"Arroz Oro","toneladas":12.5,"ubicacion":"9.7489°N,83.7534°W"}' | jq
```

## Entregables
- **Repositorio público** con este contenido (incluye `/k8s`). Agrega colaboradores si es en grupo.
- **PDF** con capturas de `kubectl get all -n agroflow -o json` y `kubectl describe` de los pods clave.

> _Nota_: Las tecnologías son **a tu elección** (esta plantilla usa Node.js), cumpliendo la arquitectura, colas y criterios.
