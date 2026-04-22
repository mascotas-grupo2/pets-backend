# pets-backend

API REST para la plataforma de mascotas perdidas, encontradas y en adopción.

## Stack

- Node.js + TypeScript
- Express
- TypeORM + PostgreSQL
- Keycloak (OpenID Connect) — disponible en el stack, sin enforcement en el backend por ahora (ver [Autenticación](#autenticación))
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
| `KEYCLOAK_ISSUER` | URL del realm de Keycloak (ej: `http://localhost:8080/realms/pets`). Solo se usa si activás el middleware JWT |
| `KEYCLOAK_AUDIENCE` | Audience esperada en los tokens (ej: `pets-backend`). Opcional |

Ver `.env.example` para los valores de desarrollo.

## Autenticación

Para esta POC el backend expone **dos endpoints propios** de register/login con hash de contraseñas (PBKDF2 + salt por usuario). Los endpoints de mascotas **no requieren auth** por ahora.

Keycloak también forma parte del stack y se levanta con `docker compose up`, pero el middleware de validación JWT (`src/lib/auth.ts`) está disponible sin aplicarse a ninguna ruta. Queda listo para enchufarlo cuando el equipo decida migrar a SSO.

### Endpoints de auth propios

```bash
# Registro
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"pass1234"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass1234"}'
```

`register` devuelve el usuario creado (sin hash ni salt) con status 201. `login` devuelve el usuario si las credenciales coinciden; 401 si no.

### Keycloak (disponible, no activo)

- El realm `pets` y el client `pets-backend` se **importan automáticamente** al levantar Keycloak. La configuración vive en [`keycloak/import/realm-pets.json`](./keycloak/import/realm-pets.json) y Keycloak la carga vía `--import-realm` la primera vez que arranca.
- Admin UI: `http://localhost:8080` con `admin` / `admin`.

Para activar la protección por JWT en algún endpoint, importá el middleware en la ruta correspondiente:

```ts
import { requireAuth } from "../lib/auth.js";

mascotasRouter.post("/", requireAuth, createMascota);
```

El middleware valida firma, issuer y (opcionalmente) audience contra el JWKS remoto de Keycloak.

## API

Base URL: `http://localhost:3001`

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | No | Estado del servidor |
| GET | `/api/mascotas` | No | Listar todas las mascotas |
| GET | `/api/mascotas/:id` | No | Obtener una mascota |
| POST | `/api/mascotas` | No | Crear mascota |
| PUT | `/api/mascotas/:id` | No | Actualizar mascota (parcial) |
| DELETE | `/api/mascotas/:id` | No | Eliminar mascota |
| POST | `/api/auth/register` | No | Registrar un nuevo usuario (`name`, `email`, `password`) |
| POST | `/api/auth/login` | No | Autenticar usuario (`email`, `password`) |

### Ejemplo de creación de mascota

```bash
curl -X POST http://localhost:3001/api/mascotas \
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
