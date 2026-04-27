# pets-backend

API REST para la plataforma de mascotas perdidas, encontradas y en adopción.

## Stack

- Node.js + TypeScript
- Express
- TypeORM + PostgreSQL
- Keycloak disponible en el stack, sin enforcement por ahora
- MinIO
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

Levanta Postgres y el backend juntos. Las migraciones corren automáticamente al iniciar el backend.

```bash
docker compose up --build
```

Si hubo cambios en migraciones o en el esquema local de la POC, lo mas simple es recrear los volumenes y levantar todo desde cero:

```bash
docker compose down -v
docker compose up --build
npm run seed
```

Servicios expuestos:

| Servicio | URL |
|---|---|
| Backend | http://localhost:3001 |
| Keycloak Admin | http://localhost:8080 |
| Postgres | localhost:5433 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

## Seed

Corre migraciones pendientes, limpia datos de prueba e inserta mascotas y un usuario admin. Requiere que Postgres este corriendo.

```bash
npm run seed
```

Usuario creado por seed:

```txt
email: admin@admin.com
password: adminadmin
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
| `PORT` | Puerto del servidor, default `3001` |
| `KEYCLOAK_ISSUER` | URL del realm de Keycloak |
| `KEYCLOAK_AUDIENCE` | Audience esperada en tokens |
| `MINIO_ENDPOINT` | Endpoint de MinIO |
| `MINIO_ACCESS_KEY` | Access key de MinIO |
| `MINIO_SECRET_KEY` | Secret key de MinIO |
| `MINIO_BUCKET` | Bucket usado para imagenes |

## Autenticación

Para esta POC el backend expone endpoints propios de register/login con hash de contraseñas. Los endpoints de mascotas, usuario y adopcion no requieren auth por ahora.

Keycloak forma parte del stack y se levanta con Docker, pero el middleware de validación JWT (`src/lib/auth.ts`) esta disponible sin aplicarse a ninguna ruta.

### Auth

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"pass1234"}'
```

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass1234"}'
```

`register` y `login` devuelven el usuario sin hash ni salt. El usuario incluye `role` y `adopter`.

## API

Base URL: `http://localhost:3001`

| Metodo | Endpoint | Auth | Descripcion |
|---|---|---|---|
| GET | `/health` | No | Estado del servidor |
| POST | `/api/auth/register` | No | Registrar usuario |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/mascotas` | No | Listar mascotas |
| GET | `/api/mascotas/:id` | No | Obtener mascota |
| POST | `/api/mascotas` | No | Crear mascota |
| PUT | `/api/mascotas/:id` | No | Actualizar mascota |
| DELETE | `/api/mascotas/:id` | No | Eliminar mascota |
| POST | `/api/mascotas/petsByIds` | No | Obtener mascotas por lista de ids |
| GET | `/api/user/commonInfo/:id` | No | Info minima del usuario para el contexto de front |
| GET | `/api/user/detailsUser?id=:id` | No | Detalle de usuario, reportes y perfil adoptante |
| POST | `/api/pet/reportar` | No | Alias compatible con front para reportar mascota |
| POST | `/api/pet/adoptar` | No | Guarda perfil adoptante y marca `adopter: true` |
| GET | `/api/pets/userPetsById?id=:id` | No | Alias compatible con front para reportes por usuario |

Tambien existen aliases:

```txt
/api/users -> mismas rutas que /api/user
/api/pets  -> mismas rutas que /api/mascotas
```

## Probar flujo de usuario

Crear usuario:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"pass1234"}'
```

Traer info minima:

```bash
curl http://localhost:3001/api/user/commonInfo/1
```

Completar perfil adoptante:

```bash
curl -X POST http://localhost:3001/api/pet/adoptar \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"preferredAnimal":"perro","firstName":"Test","lastName":"User","email":"test@example.com","phone":"1122334455","addressLine1":"Av Corrientes 123","addressLine2":"","postcode":"1000","town":"CABA","hasGarden":"si","livingSituation":"departamento","householdSetting":"urbano","activityLevel":"moderado","adults":1,"children":0,"visitingChildren":"no","hasFlatmates":"no","allergies":"","otherAnimals":"no","otherAnimalsDetail":"","neutered":"na","vaccinated":"na","experience":"Tuve mascotas antes","acceptsTerms":true}'
```

Ver detalle del usuario:

```bash
curl "http://localhost:3001/api/user/detailsUser?id=1"
```

## Probar reportes de mascotas

Reportar una mascota:

```bash
curl -X POST http://localhost:3001/api/pet/reportar \
  -H "Content-Type: application/json" \
  -d '{"name":"Toby","animalType":"perro","photo":null,"description":"Perro perdido con collar rojo","date":"2026-04-26","location":"CABA","contactPhone":"1122334455","contactEmail":"test@example.com"}'
```

Si el payload incluye `userId`, el reporte queda asociado directamente a ese usuario. Si no lo incluye, el backend intenta asociarlo por `contactEmail`.

Buscar reportes por usuario:

```bash
curl "http://localhost:3001/api/pets/userPetsById?id=1"
```

Buscar mascotas por ids:

```bash
curl -X POST http://localhost:3001/api/mascotas/petsByIds \
  -H "Content-Type: application/json" \
  -d '{"ids":["ID_DE_LA_MASCOTA"]}'
```

## Valores validos

- `animalType`: `perro`, `gato`, `otro`
- `sex`: `macho`, `hembra`
- `role`: `user`, `admin`
- Campos si/no de adopcion: `si`, `no`
- `neutered` y `vaccinated` en adopcion: `si`, `no`, `na`

## Geocodificacion de direcciones

La `location` se geocodifica al guardar utilizando Nominatim cuando el servicio externo responde. Si no hay resultado o falla la consulta, la mascota se guarda igual.

## Licencia

Este proyecto está licenciado bajo los términos de la GNU General Public License v3.0. Ver el archivo [LICENSE](./LICENSE) para más detalles.