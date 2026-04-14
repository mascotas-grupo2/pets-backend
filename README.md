# pets-backend

API REST para la plataforma de mascotas perdidas, encontradas y en adopción.

## Stack

- Node.js + TypeScript
- Express
- TypeORM + PostgreSQL
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

Levanta Postgres y el backend juntos. Las migraciones corren automáticamente al iniciar.

```bash
docker compose up --build
```

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

Ver `.env.example` para los valores de desarrollo.

## API

Base URL: `http://localhost:3001`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor |
| GET | `/api/mascotas` | Listar todas las mascotas |
| GET | `/api/mascotas/:id` | Obtener una mascota |
| POST | `/api/mascotas` | Crear mascota |
| PUT | `/api/mascotas/:id` | Actualizar mascota (parcial) |
| DELETE | `/api/mascotas/:id` | Eliminar mascota |
| POST | `/api/auth/register` | Registrar un nuevo usuario (name, email, password) |
| POST | `/api/auth/login` | Autenticar usuario (email, password) |

### Ejemplo de creación

```json
POST /api/mascotas
Content-Type: application/json

{
  "nombre": "Tobi",
  "especie": "PERRO",
  "estado": "AVISTADO",
  "raza": "Labrador",
  "edad": 4,
  "descripcion": "Collar rojo, muy amigable",
  "direccion": "Av. Corrientes 1500, Buenos Aires"
}
```

### Endpoints de autenticación

Registro de usuario:

```json
POST /api/auth/register
Content-Type: application/json

{
  "name": "Nombre Apellido",
  "email": "usuario@example.com",
  "password": "MiPass123"
}
```

Login:

```json
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "MiPass123"
}
```

### Geocodificación de direcciones

La `direccion` se geocodifica automáticamente al guardar utilizando la API [Nominatim](https://nominatim.org/release-docs/latest/api/Search/) para poder guardar `latitud` y `longitud` en la base de datos y facilitar su representación a futuro.

### Valores válidos

- `especie`: `PERRO` · `GATO` · `OTRO`
- `estado`: `AVISTADO` · `TRANSITO` · `REFUGIO`
