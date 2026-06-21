import "dotenv/config";
import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppDataSource } from "./data-source.js";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";
import { Followup } from "./entity/Followup.js";
import { Adoption } from "./entity/Adoption.js";
import { Message } from "./entity/Message.js";
import { CatalogIds, catalogIdForCode } from "./lib/catalog-constants.js";
import { uploadFileToMinio } from "./lib/minio.js";
import { calculateCompatibility } from "./lib/matching.js";

const seedAssetsDir = path.join(process.cwd(), "src", "seed-assets");

function contentTypeForFile(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".jfif") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  throw new Error(`Formato de imagen no soportado para seed: ${fileName}`);
}

async function uploadSeedPhoto(
  bucket: string,
  fileName: string,
  folder?: string,
) {
  const filePath = path.join(seedAssetsDir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`No se encontro la imagen de seed: ${filePath}`);
  }

  // Use uploadFileToMinio to place the file under a folder (e.g., pet id)
  const buffer = readFileSync(filePath);
  return uploadFileToMinio(
    bucket,
    folder ?? "",
    fileName,
    buffer,
    contentTypeForFile(fileName),
  );
}

async function seed() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  // Clear dependent tables first (those with foreign keys to pet)
  const repoFollowup = AppDataSource.getRepository(Followup);
  await repoFollowup.createQueryBuilder().delete().execute();

  const repoAdoption = AppDataSource.getRepository(Adoption);
  await repoAdoption.createQueryBuilder().delete().execute();

  // Now clear the pet table
  const repoPets = AppDataSource.getRepository(Pet);
  // Use DELETE instead of TRUNCATE on Postgres when pet is referenced by foreign keys.
  await repoPets.createQueryBuilder().delete().execute();

  const bucket = process.env.MINIO_BUCKET ?? "report-images";

  const petsData = [
    // ============= PERROS PERDIDOS =============
    {
      name: "Toby",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: catalogIdForCode("pet_status", "perdido"),
      description:
        "Perro labrador color dorado, muy cariñoso. Lleva collar rojo. Tiene una pequeña cicatriz en la oreja derecha.",
      date: "2026-05-26",
      location: "Plaza Serrano, Palermo, CABA",
      contactPhone: "1144556677",
      contactEmail: "carla.toby@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Labrador",
      ageMonths: 36,
      color: "Dorado",
      weightKg: 28,
      hasCollar: true,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: true,
      trained: true,
      activityLevelId: CatalogIds.activityLevel.moderado,
      seedImage: "toby.png",
    },
    {
      name: "Coco",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.perdido,
      description:
        "Caniche toy color caramelo. Responde a su nombre. Lleva collar con cascabel.",
      date: "2026-05-27",
      location: "Triunvirato 4200, Villa Urquiza, CABA",
      contactPhone: "1133445566",
      contactEmail: "lucia.coco@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Caniche toy",
      ageMonths: 18,
      color: "Caramelo",
      weightKg: 3,
      hasCollar: true,
      hasTag: true,
      vaccinated: true,
      neutered: true,
      reward: "$50.000",
      friendlyWithKids: false,
      friendlyWithPets: true,
      trained: false,
      activityLevelId: CatalogIds.activityLevel.activo,
      seedImage: "coco.png",
    },

    // ============= PERROS ENCONTRADOS =============
    {
      name: "Bobi",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: catalogIdForCode("pet_status", "encontrado"),
      description:
        "Perro mestizo tamaño mediano, marrón con patas blancas. Sin collar. Muy amigable, parece bien cuidado.",
      date: "2026-05-26",
      location: "Parque Barrancas de Belgrano, CABA",
      contactPhone: "1177889900",
      contactEmail: "rescate.belgrano@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Mestizo",
      ageMonths: 48,
      color: "Marrón y blanco",
      weightKg: 15,
      hasCollar: false,
      friendlyWithKids: true,
      friendlyWithPets: true,
      trained: false,
      activityLevelId: CatalogIds.activityLevel.moderado,
      seedImage: "bobi.png",
    },
    {
      name: "Manchas",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.encontrado,
      description:
        "Perro chico negro con manchas blancas en el pecho. Tenía collar rosa sin chapita.",
      date: "2026-05-28",
      location: "Av. Rivadavia 4800, Almagro, CABA",
      contactPhone: "1166554433",
      contactEmail: "vecinos.almagro@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Mestizo",
      ageMonths: 24,
      color: "Negro y blanco",
      weightKg: 8,
      hasCollar: true,
      friendlyWithKids: true,
      friendlyWithPets: false,
      trained: true,
      activityLevelId: CatalogIds.activityLevel.activo,
      seedImage: "manchas.png",
    },

    // ============= PERROS EN ADOPCIÓN =============
    {
      name: "Max",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: catalogIdForCode("pet_status", "en adopción"),
      description:
        "Perro mestizo de 2 años rescatado de la calle. Castrado, vacunado, desparasitado. Bueno con chicos y otros perros. Necesita una familia paciente que le dé tiempo de adaptación.",
      date: "2026-05-15",
      location: "Refugio Patitas Felices, Villa Crespo, CABA",
      contactPhone: "1155667788",
      contactEmail: "adopciones@patitasfelices.example.com",
      sexId: catalogIdForCode("pet_sex", "macho"),
      breed: "Mestizo",
      ageMonths: 24,
      color: "Negro",
      weightKg: 18,
      neutered: true,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: true,
      trained: true,
      activityLevelId: CatalogIds.activityLevel.tranquilo,
      seedImage: "max.png",
    },
    {
      name: "Rocco",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.adopcion,
      description:
        "Bulldog francés joven, súper sociable. Energético, ideal para una familia con espacio. Castrado y al día con sus vacunas.",
      date: "2026-05-18",
      location: "Hogar Canino San Telmo, CABA",
      contactPhone: "1133221100",
      contactEmail: "adopta@hogarcanino.example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Bulldog francés",
      ageMonths: 14,
      color: "Atigrado",
      weightKg: 11,
      neutered: true,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: false,
      trained: false,
      activityLevelId: CatalogIds.activityLevel.activo,
      seedImage: "rocco.png",
    },

    // ============= GATOS PERDIDOS =============
    {
      name: "Pelusa",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.perdido,
      description:
        "Gata blanca con manchas grises en el lomo. Asustadiza con extraños pero busca cariño una vez en confianza.",
      date: "2026-05-25",
      location: "Av. Rivadavia 5400, Caballito, CABA",
      contactPhone: "1166778899",
      contactEmail: "matias.pelusa@example.com",
      sexId: catalogIdForCode("pet_sex", "hembra"),
      breed: "Común europeo",
      ageMonths: 24,
      color: "Blanco y gris",
      weightKg: 4,
      hasCollar: false,
      microchipped: true,
      neutered: true,
      friendlyWithKids: false,
      friendlyWithPets: true,
      trained: true,
      activityLevelId: CatalogIds.activityLevel.tranquilo,
      seedImage: "pelusa.png",
    },
    {
      name: "Simba",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.perdido,
      description:
        "Gato naranja persa, muy peludo. Se escapó por una ventana. Tiene microchip y collar con chapita.",
      date: "2026-05-24",
      location: "Junín 1800, Recoleta, CABA",
      contactPhone: "1188990011",
      contactEmail: "valentina.simba@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Persa",
      ageMonths: 30,
      color: "Naranja",
      weightKg: 5,
      hasCollar: true,
      hasTag: true,
      microchipped: true,
      neutered: true,
      reward: "$30.000",
      friendlyWithKids: true,
      friendlyWithPets: false,
      trained: true,
      activityLevelId: catalogIdForCode("activity_level", "moderado"),
      seedImage: "simba.png",
    },

    // ============= GATOS ENCONTRADOS =============
    {
      name: "Michi",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.encontrado,
      description:
        "Gata atigrada chiquita, parece joven. Maúlla mucho. La encontramos en el patio de un edificio.",
      date: "2026-05-27",
      location: "Bulnes 800, Almagro, CABA",
      contactPhone: "1122334455",
      contactEmail: "vecinos.almagro@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Común europeo",
      ageMonths: 8,
      color: "Atigrada",
      weightKg: 2,
      hasCollar: false,
      friendlyWithKids: true,
      friendlyWithPets: true,
      trained: false,
      activityLevelId: catalogIdForCode("activity_level", "activo"),
      seedImage: "michi.png",
    },
    {
      name: "Salem",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.encontrado,
      description:
        "Gato negro adulto, ojos verdes muy expresivos. Vino solo a la puerta de mi casa. Está flaco pero parece sano.",
      date: "2026-05-29",
      location: "Av. Rivadavia 7300, Flores, CABA",
      contactPhone: "1144332211",
      contactEmail: "rescata.flores@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Común europeo",
      ageMonths: 36,
      color: "Negro",
      weightKg: 3,
      friendlyWithKids: false,
      friendlyWithPets: false,
      trained: true,
      activityLevelId: catalogIdForCode("activity_level", "tranquilo"),
      seedImage: "salem.png",
    },

    // ============= GATOS EN ADOPCIÓN =============
    {
      name: "Mishi",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.adopcion,
      description:
        "Gata adulta calma y mimosa, ideal para departamento. Esterilizada, al día con vacunas. Convive bien con otros gatos.",
      date: "2026-05-10",
      location: "Hogar Felino, Boedo, CABA",
      contactPhone: "1199001122",
      contactEmail: "adopta@hogarfelino.example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Siamés cruza",
      ageMonths: 60,
      color: "Crema y marrón",
      weightKg: 4,
      neutered: true,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: true,
      trained: true,
      activityLevelId: CatalogIds.activityLevel.tranquilo,
      seedImage: "mishi.png",
    },
    {
      name: "Luna",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.adopcion,
      description:
        "Gata joven, naranja con blanco, muy juguetona y curiosa. Buena con otros gatos. Esterilizada, al día con vacunas y desparasitación.",
      date: "2026-05-20",
      location: "Refugio Huellitas Mininas, Palermo, CABA",
      contactPhone: "1177665544",
      contactEmail: "adopciones@huellitasmininas.example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Común europeo",
      ageMonths: 10,
      color: "Naranja y blanco",
      weightKg: 3,
      neutered: true,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: true,
      trained: false,
      activityLevelId: CatalogIds.activityLevel.activo,
      seedImage: "luna.png",
    },
  ];

  const keepPending = new Set(["Coco", "Manchas"]);

  const createdPets: { id: string; name: string | null }[] = [];
  for (const item of petsData) {
    // El campo `seedImage` es opcional y solo está presente en algunas
    // mascotas del dataset. Lo extraemos antes de persistir.
    const { seedImage, ...petFields } = item as any;
    const created = await repoPets.save(
      repoPets.create({
        ...(petFields as Partial<Pet>),
        reportStatusId: keepPending.has((item as any).name)
          ? CatalogIds.petReportStatus.pendiente
          : CatalogIds.petReportStatus.activo,
      }),
    );
    createdPets.push({ id: created.id, name: created.name ?? null });
    if (seedImage) {
      try {
        const url = await uploadSeedPhoto(
          bucket,
          seedImage,
          String(created.id),
        );
        created.photos = [url];
        await repoPets.save(created);
      } catch (e) {
        console.warn("No se pudo subir imagen de seed para pet", created.id, e);
      }
    }
  }
  console.log(`Seed completed: ${petsData.length} pets inserted.`);

  const repoMessages = AppDataSource.getRepository(Message);
  await repoMessages.createQueryBuilder().delete().execute();

  const repoUsers = AppDataSource.getRepository(User);
  await repoUsers.createQueryBuilder().delete().execute();
  const password = "Admin1234!";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 310000, 32, "sha256")
    .toString("hex");
  const adminSaved = await repoUsers.save(
    repoUsers.create({
      name: "Laura Fernández",
      email: "admin@admin.com",
      passwordHash: hash,
      passwordSalt: salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    }),
  );
  try {
    const url = await uploadSeedPhoto(bucket, "admin.png", "users");
    adminSaved.photo = url;
    await repoUsers.save(adminSaved);
  } catch (e) {
    console.warn("No se pudo subir imagen de seed para admin", e);
  }
  console.log("Seed completed: Admin user inserted (role=admin).");

  // Add two regular users (role = user)
  const usersToCreate = [
    {
      name: "Juan Pérez",
      email: "juan.perez@example.com",
      seedImage: "juan.png",
    },
    {
      name: "María Gómez",
      email: "maria.gomez@example.com",
      seedImage: "maria.png",
    },
    { name: "Cberto", email: "cberto021@gmail.com", seedImage: "carlos.png" },
  ];
  const createdUsers: { id: number; email: string }[] = [];
  for (const u of usersToCreate) {
    const usalt = crypto.randomBytes(16).toString("hex");
    const uhash = crypto
      .pbkdf2Sync(password, usalt, 310000, 32, "sha256")
      .toString("hex");
    const saved = await repoUsers.save(
      repoUsers.create({
        name: u.name,
        email: u.email,
        passwordHash: uhash,
        passwordSalt: usalt,
        roleId: CatalogIds.userRole.user,
        emailVerified: true,
      }),
    );
    try {
      const url = await uploadSeedPhoto(bucket, u.seedImage, "users");
      saved.photo = url;
      await repoUsers.save(saved);
    } catch (e) {
      console.warn("No se pudo subir imagen de seed para", u.name, e);
    }
    createdUsers.push({ id: saved.id, email: saved.email });
  }
  // include admin in the createdUsers array for easier referencing
  createdUsers.unshift({ id: adminSaved.id, email: adminSaved.email });
  console.log("Seed completed: 2 usuarios insertados (role=user).");

  // Add more users to reach ~10 regular users
  const realNames = [
    "Carlos Ruiz",
    "Ana López",
    "Ricardo Martínez",
    "Pedro Silva",
    "Lucía González",
    "Sofía Rodríguez",
    "Diego Fernández",
    "Valentina Díaz",
  ];
  const moreUsers: { name: string; email: string; seedImage: string }[] = [];
  for (let i = 0; i < realNames.length; i++) {
    const nameParts = realNames[i].toLowerCase().split(" ");
    const firstName = nameParts[0]
      .replace("á", "a")
      .replace("é", "e")
      .replace("í", "i")
      .replace("ó", "o")
      .replace("ú", "u");
    const lastName = nameParts[1]
      .replace("á", "a")
      .replace("é", "e")
      .replace("í", "i")
      .replace("ó", "o")
      .replace("ú", "u");
    moreUsers.push({
      name: realNames[i],
      email: `${firstName}.${lastName}@example.com`,
      seedImage: `${firstName}.png`,
    });
  }
  for (const u of moreUsers) {
    const usalt = crypto.randomBytes(16).toString("hex");
    const uhash = crypto
      .pbkdf2Sync(password, usalt, 310000, 32, "sha256")
      .toString("hex");
    const saved = await repoUsers.save(
      repoUsers.create({
        name: u.name,
        email: u.email,
        passwordHash: uhash,
        passwordSalt: usalt,
        roleId: CatalogIds.userRole.user,
        emailVerified: true,
      }),
    );
    try {
      const url = await uploadSeedPhoto(bucket, u.seedImage, "users");
      saved.photo = url;
      await repoUsers.save(saved);
    } catch (e) {
      console.warn("No se pudo subir imagen de seed para", u.name, e);
    }
    createdUsers.push({ id: saved.id, email: saved.email });
  }
  // fetch all users count for logging
  const usersCount = await repoUsers.count();
  console.log(`Seed completed: ${usersCount} usuarios en total.`);

  // (removed duplicate extra user insertion to avoid unique email conflicts)

  // Create ~10 additional pet posts (active) with better names and unique descriptions
  const extraPetNames = [
    "Bruno",
    "Simba",
    "Chispa",
    "Maya",
    "Rambo",
    "Bella",
    "Kira",
    "Balto",
    "Zoe",
    "Thor",
  ];
  const extraPetDescriptions = [
    "Perro cariñoso que ama pasear y jugar con pelotas.",
    "Gato curioso que se esconde en cajas y ventanas soleadas.",
    "Cachorro energético, ideal para familias activas.",
    "Gata tranquila y mansa, se lleva bien con otros animales.",
    "Perro protector y leal, buen guardián de casa.",
    "Hembra dulce, busca hogar con paciencia y afecto.",
    "Gata activa y juguetona, le encanta perseguir cuerdas.",
    "Perro de tamaño mediano, sociable y obediente.",
    "Gatito pequeño, juguetón y muy afectuoso.",
    "Perro joven, curioso y con mucha energía para entrenar.",
  ];

  const extraPetImages = [
    "bruno.png",
    "simba_extra.png",
    "chispa.png",
    "maya.png",
    "rambo.png",
    "bella.png",
    "kira.png",
    "balto.png",
    "zoe.png",
    "thor.png",
  ];

  // Ubicaciones reales de CABA (el front conoce sus coordenadas para la vista mapa).
  const extraPetLocations = [
    "Plaza Serrano, Palermo, CABA",
    "Parque Centenario, Caballito, CABA",
    "Parque Lezama, San Telmo, CABA",
    "Parque Rivadavia, Caballito, CABA",
    "Barrancas de Belgrano, CABA",
    "Parque Chacabuco, CABA",
    "Plaza Irlanda, Caballito, CABA",
    "Parque Los Andes, Chacarita, CABA",
    "Plaza Pueyrredón, Flores, CABA",
    "Parque Saavedra, CABA",
  ];
  const extraPetTypes = [
    CatalogIds.animalType.perro, // Bruno  - "Perro cariñoso..."
    CatalogIds.animalType.gato, // Simba  - "Gato curioso..."
    CatalogIds.animalType.perro, // Chispa - "Cachorro energético..."
    CatalogIds.animalType.gato, // Maya   - "Gata tranquila..."
    CatalogIds.animalType.perro, // Rambo  - "Perro protector..."
    CatalogIds.animalType.gato, // Bella  - "Hembra dulce..."
    CatalogIds.animalType.gato, // Kira   - "Gata activa..."
    CatalogIds.animalType.perro, // Balto  - "Perro de tamaño mediano..."
    CatalogIds.animalType.gato, // Zoe    - "Gatito pequeño..."
    CatalogIds.animalType.perro, // Thor   - "Perro joven..."
  ];
  const extraPetSexes = [
    CatalogIds.petSex.macho, // Bruno
    CatalogIds.petSex.macho, // Simba
    CatalogIds.petSex.macho, // Chispa
    CatalogIds.petSex.hembra, // Maya
    CatalogIds.petSex.macho, // Rambo
    CatalogIds.petSex.hembra, // Bella
    CatalogIds.petSex.hembra, // Kira
    CatalogIds.petSex.macho, // Balto
    CatalogIds.petSex.hembra, // Zoe
    CatalogIds.petSex.macho, // Thor
  ];

  // Pesos explícitos para cubrir las 3 categorías del filtro de tamaño
  // (pequeño ≤10kg, mediano ≤25kg, grande >25kg), coherentes con el tipo.
  const extraPetWeights = [
    30, // Bruno  - perro grande
    5, // Simba  - gato
    8, // Chispa - perro pequeño (cachorro)
    4, // Maya   - gata
    35, // Rambo  - perro grande
    4, // Bella  - gata
    5, // Kira   - gata
    22, // Balto  - perro mediano
    3, // Zoe    - gata
    18, // Thor   - perro mediano
  ];

  // Estados variados (perdido/encontrado/tránsito/adopción) para enriquecer el listado.
  const extraPetStatuses = [
    CatalogIds.petStatus.perdido,
    CatalogIds.petStatus.perdido,
    CatalogIds.petStatus.encontrado,
    CatalogIds.petStatus.perdido,
    CatalogIds.petStatus.adopcion,
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.encontrado,
    CatalogIds.petStatus.adopcion,
    CatalogIds.petStatus.perdido,
    CatalogIds.petStatus.adopcion,
  ];
  // Antigüedad del reporte en días, relativa a HOY → habilita la urgencia y el orden.
  const extraPetDaysAgo = [1, 0, 3, 8, 22, 2, 13, 30, 6, 40];
  const isoDaysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  // Coordenadas reales (lat, lng) de cada ubicación → habilitan el mapa por
  // cercanía (el front calcula la distancia a "Vos" con turf).
  const extraPetCoords: [number, number][] = [
    [-34.5889, -58.4306], // Plaza Serrano, Palermo
    [-34.6064, -58.4356], // Parque Centenario, Caballito
    [-34.628, -58.3697], // Parque Lezama, San Telmo
    [-34.6184, -58.4357], // Parque Rivadavia, Caballito
    [-34.561, -58.4546], // Barrancas de Belgrano
    [-34.6357, -58.4316], // Parque Chacabuco
    [-34.6156, -58.4456], // Plaza Irlanda, Caballito
    [-34.5856, -58.4519], // Parque Los Andes, Chacarita
    [-34.628, -58.4636], // Plaza Pueyrredón, Flores
    [-34.5547, -58.4869], // Parque Saavedra
  ];

  const extraPets = [] as any[];
  for (let i = 0; i < extraPetNames.length; i++) {
    const name = extraPetNames[i];
    extraPets.push({
      name,
      animalTypeId: extraPetTypes[i],
      description: extraPetDescriptions[i],
      date: isoDaysAgo(extraPetDaysAgo[i]),
      location: extraPetLocations[i],
      latitud: extraPetCoords[i][0],
      longitud: extraPetCoords[i][1],
      contactPhone: `11500000${i + 1}`,
      contactEmail: `pet${i + 1}@example.com`,
      sexId: extraPetSexes[i],
      breed: "Común",
      ageMonths: 6 + i,
      color: "Mixto",
      weightKg: extraPetWeights[i],
      vaccinated: i % 3 !== 0,
      friendlyWithKids: i % 2 === 0,
      friendlyWithPets: i % 4 !== 0,
      activityLevelId:
        i % 3 === 0
          ? CatalogIds.activityLevel.tranquilo
          : i % 3 === 1
            ? CatalogIds.activityLevel.moderado
            : CatalogIds.activityLevel.activo,
      statusId: extraPetStatuses[i],
      reportStatusId: CatalogIds.petReportStatus.activo,
      seedImage: extraPetImages[i],
    });
  }
  const createdExtraPets = [] as any[];
  for (const p of extraPets) {
    const { seedImage, ...petFields } = p as any;
    const created = await repoPets.save(
      repoPets.create(petFields as Partial<Pet>),
    );
    createdExtraPets.push(created);
    if (seedImage) {
      try {
        const url = await uploadSeedPhoto(
          bucket,
          seedImage,
          String(created.id),
        );
        created.photos = [url];
        await repoPets.save(created);
      } catch (e) {
        console.warn(
          "No se pudo subir imagen de seed para pet adicional",
          created.id,
          e,
        );
      }
    }
  }
  console.log(
    `Seed completed: ${createdExtraPets.length} mascotas adicionales insertadas (reportStatus=activo).`,
  );

  // Asignar un publicador (userId) SOLO a las mascotas PERDIDAS. Son reportes
  // personales de un usuario que busca a su mascota, así los comentarios y
  // avistamientos ("La vi") le notifican al dueño (notify() corta si es null).
  // Las de adopción/refugio/tránsito son institucionales (del refugio) y quedan
  // sin dueño para no aparecer en el "Mis reportes" de un usuario común.
  // (Las mascotas se crean antes que los usuarios, por eso se asigna acá.)
  const publisherIds = createdUsers
    .filter((u) => u.email !== "admin@admin.com")
    .map((u) => u.id);
  if (publisherIds.length > 0) {
    const lostPets = await repoPets.find({
      where: { statusId: CatalogIds.petStatus.perdido },
    });
    for (let i = 0; i < lostPets.length; i++) {
      await repoPets.update(
        { id: lostPets[i].id },
        { userId: publisherIds[i % publisherIds.length] },
      );
    }
    console.log(
      `Seed completed: publicador (userId) asignado a ${lostPets.length} mascotas perdidas (comentarios y avistamientos notifican al dueño).`,
    );
  }

  // --- Fechas variadas para los filtros del listado ---
  // El filtro de fecha (hoy/semana/mes) usa `createdAt`, no `date`. Como el seed
  // inserta todo junto, sin esto todas quedarían en "hoy". Espaciamos `createdAt`
  // y sincronizamos `date` (la fecha de reporte que se muestra) para que coincidan.
  // createdAt es @CreateDateColumn (TypeORM lo pisa en el INSERT), así que se
  // setea con un UPDATE directo.
  const allCreatedPetIds = [
    ...createdPets.map((p) => p.id),
    ...createdExtraPets.map((p) => p.id),
  ];
  const dayOffsets = [
    0, 0, 1, 2, 3, 5, 6, 8, 10, 13, 15, 18, 20, 22, 25, 28, 35, 40, 45, 55, 60,
    70,
  ];
  for (let i = 0; i < allCreatedPetIds.length; i++) {
    const offset = dayOffsets[i % dayOffsets.length];
    const d = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    await AppDataSource.query(
      `UPDATE "pet" SET "createdAt" = $1, "date" = $2 WHERE "id" = $3`,
      [d.toISOString(), d.toISOString().slice(0, 10), allCreatedPetIds[i]],
    );
  }
  console.log(
    `Seed completed: createdAt/date espaciados en ${allCreatedPetIds.length} mascotas (para filtros de fecha).`,
  );

  // Refresh lists of users and pets to reference in adoptions and followups
  // Refresh lists of users and pets to reference in adoptions and followups
  const allUsers = await repoUsers.find();
  const allPets = await repoPets.find();
  // Build deterministic lists of created pet ids and user ids for tests
  const deterministicPetIds = [
    ...createdPets.map((p) => p.id),
    ...createdExtraPets.map((p) => p.id),
  ];
  const deterministicUserIds = createdUsers.map((u) => u.id);

  // Create ~10 adoption requests
  const repoAdopt = repoAdoption; // already defined above
  const adoptionSamples = [] as Adoption[];
  const firstNames = [
    "Juan",
    "Maria",
    "Carlos",
    "Ana",
    "Laura",
    "Ricardo",
    "Pedro",
    "Lucia",
    "Sofia",
    "Diego",
  ];
  const lastNames = [
    "Perez",
    "Gomez",
    "Ruiz",
    "Lopez",
    "Martinez",
    "Silva",
    "Gonzalez",
    "Rodriguez",
    "Fernandez",
    "Diaz",
  ];

  for (let i = 1; i <= 10; i++) {
    const user = allUsers[i % allUsers.length];
    const pet = allPets[i % allPets.length];
    const a = repoAdopt.create({
      userId: user?.id ?? null,
      petId: pet?.id ?? null,
      preferredAnimalTypeId: pet?.animalTypeId ?? null,
      firstName: firstNames[i % firstNames.length],
      lastName: lastNames[i % lastNames.length],
      email: `${firstNames[i % firstNames.length].toLowerCase()}.${lastNames[i % lastNames.length].toLowerCase()}@example.com`,
      phone: `11600000${i}`,
      addressLine1: `Calle ${i * 10} #${i * 100}`,
      addressLine2: null,
      postcode: `C100${i}`,
      town: "Ciudad Autónoma de Buenos Aires",
      hasGardenId: i % 2 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      livingSituationId:
        i % 2 === 0
          ? CatalogIds.livingSituation.casa
          : CatalogIds.livingSituation.departamento,
      householdSettingId: CatalogIds.householdSetting.urbano,
      activityLevelId:
        i % 3 === 0
          ? CatalogIds.activityLevel.activo
          : i % 3 === 1
            ? CatalogIds.activityLevel.moderado
            : CatalogIds.activityLevel.tranquilo,
      adults: (i % 3) + 1,
      children: i % 4,
      visitingChildrenId:
        i % 3 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      hasFlatmatesId: CatalogIds.yesNo.no,
      allergies: i === 5 ? "Tengo alergia a los gatos" : null,
      otherAnimalsId: i % 2 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      otherAnimalsDetail: i % 2 === 0 ? "Tengo un perro pequeño" : null,
      neuteredId: CatalogIds.yesNo.si,
      vaccinatedId: CatalogIds.yesNo.si,
      experience:
        i % 2 === 0
          ? "Tengo experiencia previa con mascotas rescatadas"
          : "Es mi primera mascota",
      acceptsTerms: true,
      statusId: Object.values(CatalogIds.adoptionStatus)[
        i % Object.values(CatalogIds.adoptionStatus).length
      ],
      compatibilityScore: null,
    });

    // Calculate compatibility score
    if (pet) {
      a.compatibilityScore = calculateCompatibility(a, pet).score;
    }

    adoptionSamples.push(a as any);
  }
  await repoAdopt.save(adoptionSamples);
  // created_at es @CreateDateColumn (TypeORM lo pisa con now() en el INSERT), así
  // que todas quedarían con la MISMA fecha y la columna "Fecha" del admin no
  // ordenaría. Lo espaciamos 1 día entre sí con un UPDATE posterior.
  await AppDataSource.query(`
    UPDATE adoption a SET created_at = now() - (s.rn * interval '1 day')
    FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM adoption) s
    WHERE a.id = s.id
  `);
  console.log(
    `Seed completed: ${adoptionSamples.length} solicitudes de adopción insertadas (createdAt espaciado).`,
  );

  // Create ~10 followups (appointments) in the future
  const repoF = repoFollowup; // already defined above
  const followupsToSave = [] as any[];
  // Create followups referencing deterministic pet and user ids (useful for tests)
  for (let i = 0; i < 10; i++) {
    const user = allUsers[i % allUsers.length];
    const pet = allPets[i % allPets.length];
    const appointment = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000); // i+1 days in future
    const fu = repoF.create({
      petId: pet.id,
      userId: user.id,
      typeId: (i % 6) + 1301,
      appointmentAt: appointment,
      statusId: CatalogIds.followupStatus.pendiente,
    });
    followupsToSave.push(fu);
  }
  await repoF.save(followupsToSave);
  console.log(
    `Seed completed: ${followupsToSave.length} seguimientos insertados.`,
  );

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
