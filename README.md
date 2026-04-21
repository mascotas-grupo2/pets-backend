# pets-backend

API REST para la plataforma de mascotas perdidas, encontradas y en adopción.

## Stack

- Node.js + TypeScript
- Express
- TypeORM + PostgreSQL
- Keycloak (OpenID Connect) para autenticación SSO
- Docker

## Requisitos previos

- [Node.js 22+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)

## Configuración inicial

```bash
npm install
cp .env.example .env
```

## Levantar el proyecto con Docker

Levanta Postgres, Keycloak y el backend juntos. Las migraciones corren automáticamente al iniciar.

```bash
docker compose up --build
```

Servicios expuestos:

| Servicio | URL |
|---|---|
| Backend | http://localhost:3001 |
| Keycloak Admin | http://localhost:8080 |
| Postgres | localhost:5433 |

## Seed

Inserta 2 mascotas de prueba. Requiere que el backend (y Postgres) estén corriendo.

```bash
npm run seed
```

## Scripts

| Comando | Descripción |
|---|---|
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Corre el build compilado |
| `npm run seed` | Inserta datos de prueba |
| `npm run migration:generate -- src/migration/NombreMigracion` | Genera una migración nueva |
| `npm run migration:run` | Corre migraciones pendientes |
| `npm run migration:revert` | Revierte la última migración |

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `PORT` | Puerto del servidor (default: 3001) |
| `KEYCLOAK_ISSUER` | URL del realm de Keycloak (ej: `http://localhost:8080/realms/pets`) |
| `KEYCLOAK_AUDIENCE` | Audience esperada en los tokens (el client-id del backend, ej: `pets-backend`) |

Ver `.env.example` para los valores de desarrollo.

## Autenticación con Keycloak

El backend valida tokens JWT firmados por Keycloak usando el endpoint JWKS del realm. No maneja contraseñas ni sesiones propias: la identidad es 100% delegada a Keycloak.

### Setup del realm

El realm `pets` y el client `pets-backend` se **importan automáticamente** al levantar Keycloak. La configuración versionada vive en [`keycloak/import/realm-pets.json`](./keycloak/import/realm-pets.json) y Keycloak la carga vía `--import-realm` la primera vez que arranca.

Lo único que cada integrante tiene que hacer manualmente es **crear su usuario**:

1. Abrir `http://localhost:8080` e ingresar con `admin` / `admin`.
2. Seleccionar el realm **`pets`** (arriba a la izquierda).
3. Ir a **Users → Add user**, poner username, guardar.
4. En la pestaña **Credentials**, setear una contraseña (destildar "Temporary").

> **¿Modificaste algo en la UI y querés compartirlo con el equipo?** Exportá el realm (`Realm settings → Action → Partial export`) y reemplazá `keycloak/import/realm-pets.json`. Para que el cambio tome efecto en tu máquina: `docker compose down -v && docker compose up` (borra el volumen de Keycloak y re-importa).

### Flujo típico

1. El frontend (pets-front) redirige al usuario a Keycloak para autenticarse (Authorization Code + PKCE).
2. Keycloak devuelve un `access_token` (JWT) al frontend.
3. El frontend llama a este backend incluyendo el header `Authorization: Bearer <access_token>`.
4. Este backend valida firma, issuer y expiración contra el JWKS de Keycloak. Si es válido, deja pasar.

### Obtener un token manualmente para testing

Usando el flujo Direct Access Grants (`Password`) — útil para pruebas, no usar en producción:

```bash
curl -X POST 'http://localhost:8080/realms/pets/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id=pets-backend' \
  --data-urlencode 'username=<tu_usuario>' \
  --data-urlencode 'password=<tu_password>'
```

> Para que funcione, habilitar en el client **Capability config → Direct access grants**.

## API

Base URL: `http://localhost:3001`

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | No | Estado del servidor |
| GET | `/api/mascotas` | No | Listar todas las mascotas |
| GET | `/api/mascotas/:id` | No | Obtener una mascota |
| POST | `/api/mascotas` | Sí | Crear mascota |
| PUT | `/api/mascotas/:id` | Sí | Actualizar mascota (parcial) |
| DELETE | `/api/mascotas/:id` | Sí | Eliminar mascota |

Los endpoints marcados con **Auth: Sí** requieren el header `Authorization: Bearer <token>`.

### Ejemplo de creación

```bash
curl -X POST http://localhost:3001/api/mascotas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Tobi",
    "especie": "PERRO",
    "estado": "AVISTADO",
    "raza": "Labrador",
    "edad": 4,
    "descripcion": "Collar rojo, muy amigable",
    "direccion": "Av. Corrientes 1500, Buenos Aires"
  }'
```

### Geocodificación de direcciones

La `direccion` se geocodifica automáticamente al guardar utilizando la API [Nominatim](https://nominatim.org/release-docs/latest/api/Search/) para poder guardar `latitud` y `longitud` en la base de datos y facilitar su representación a futuro.

### Valores válidos

- `especie`: `PERRO` · `GATO` · `OTRO`
- `estado`: `AVISTADO` · `TRANSITO` · `REFUGIO`

## Licencia

Este proyecto está licenciado bajo los términos de la GNU General Public License v3.0. Ver el archivo [LICENSE](./LICENSE) para más detalles.
