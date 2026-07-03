import "dotenv/config";
import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppDataSource } from "./data-source.js";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";
import { Followup } from "./entity/Followup.js";
import { Adoption } from "./entity/Adoption.js";
import { Refugio } from "./entity/Refugio.js";
import { Message } from "./entity/Message.js";
import { PetNote } from "./entity/PetNote.js";
import { Sighting } from "./entity/Sighting.js";
import { PetComment } from "./entity/PetComment.js";
import { Notification } from "./entity/Notification.js";
import { Activity } from "./entity/Activity.js";
import { CatalogIds, CatalogSeed, catalogIdForCode } from "./lib/catalog-constants.js";
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

  const refugioRepo = AppDataSource.getRepository(Refugio);
  const MORON_LOCATION = "Av. Rivadavia 18500, Morón, Buenos Aires";
  const HURLINGHAM_LOCATION = "Av. Vergara 2210, Hurlingham, Buenos Aires";
  let refugioMoron = await refugioRepo.findOneBy({ slug: "refugio-moron" });
  if (!refugioMoron) refugioMoron = refugioRepo.create({ slug: "refugio-moron" });
  refugioMoron.name = "Refugio Morón";
  refugioMoron.location = MORON_LOCATION;
  refugioMoron.active = true;
  refugioMoron = await refugioRepo.save(refugioMoron);
  let refugioHurlingham = await refugioRepo.findOneBy({ slug: "refugio-hurlingham" });
  if (!refugioHurlingham) refugioHurlingham = refugioRepo.create({ slug: "refugio-hurlingham" });
  refugioHurlingham.name = "Refugio Hurlingham";
  refugioHurlingham.location = HURLINGHAM_LOCATION;
  refugioHurlingham.active = true;
  refugioHurlingham = await refugioRepo.save(refugioHurlingham);
  const refugioMoronId = refugioMoron.id;
  const refugioHurlinghamId = refugioHurlingham.id;
  // Seed auto-suficiente: asegurar que todos los catalog values existan en la BD
  for (const item of CatalogSeed) {
    await AppDataSource.query(
      `INSERT INTO "catalog_value" ("id", "catalog", "code", "label")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("id") DO UPDATE SET
         "catalog" = EXCLUDED."catalog",
         "code" = EXCLUDED."code",
         "label" = EXCLUDED."label"`,
      [item.id, item.catalog, item.code, item.label],
    );
  }


  // Clear dependent tables first (those with foreign keys to pet)
  const repoFollowup = AppDataSource.getRepository(Followup);
  await repoFollowup.createQueryBuilder().delete().execute();

  const repoAdoption = AppDataSource.getRepository(Adoption);
  await repoAdoption.createQueryBuilder().delete().execute();

  // Limpiar tablas runtime que referencian pets/users/adoptions por id pero SIN
  // foreign key (no hay cascade): si no, acumulan filas huérfanas entre reseeds.
  // Caso concreto: una nota de RECLAMO ("Confirmar devolución") apuntando a una
  // mascota ya borrada hacía que confirm-return devolviera 404 "Pet no encontrada".
  for (const table of [
    "pet_note",
    "pet_comment",
    "sighting",
    "adoption_note",
    "adoption_check",
    "activity",
    "notification",
    "chat_message",
    "chat_session",
  ]) {
    await AppDataSource.query(`DELETE FROM "${table}"`);
  }

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

  // Fotos adicionales para algunas mascotas: el alta real soporta hasta 6 fotos
  // y el detalle muestra una galería de miniaturas, pero el seed daba 1 sola foto
  // por mascota, así que la galería nunca se veía. Acá sumamos imágenes extra
  // (de la misma especie) a unas pocas mascotas para que la galería sea visible
  // en la demo. Son solo assets de muestra, no fotos reales del mismo animal.
  const extraSeedImages: Record<string, string[]> = {
    Max: ["bobi.png", "bruno.png"],
    Rocco: ["balto.png", "thor.png"],
    Toby: ["rambo.png"],
    Luna: ["michi.png", "pelusa.png"],
    Mishi: ["michi.png", "salem.png"],
    // simba_extra.png es una 2ª foto del MISMO Simba (galería), no otra mascota.
    Simba: ["simba_extra.png"],
  };

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
        const urls = [
          await uploadSeedPhoto(bucket, seedImage, String(created.id)),
        ];
        for (const extra of extraSeedImages[(item as any).name] ?? []) {
          try {
            urls.push(await uploadSeedPhoto(bucket, extra, String(created.id)));
          } catch (e) {
            console.warn("No se pudo subir imagen extra de seed", extra, e);
          }
        }
        created.photo = urls[0];
        created.photos = urls;
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
    .pbkdf2Sync("Moron1234!", salt, 310000, 32, "sha256")
    .toString("hex");
  const adminSaved = await repoUsers.save(
    repoUsers.create({
      name: "Laura Fernández",
      email: "admin@refugiomoron.com",
      passwordHash: hash,
      passwordSalt: salt,
      roleId: CatalogIds.userRole.admin,
      refugioId: refugioMoronId,
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
  console.log("Seed completed: Admin Morón inserted (admin@refugiomoron.com).");

  const salt2 = crypto.randomBytes(16).toString("hex");
  const hash2 = crypto
    .pbkdf2Sync("Hurlingham1234!", salt2, 310000, 32, "sha256")
    .toString("hex");
  await repoUsers.save(
    repoUsers.create({
      name: "Diego Sosa",
      email: "admin@refugiohurlingham.com",
      passwordHash: hash2,
      passwordSalt: salt2,
      roleId: CatalogIds.userRole.admin,
      refugioId: refugioHurlinghamId,
      emailVerified: true,
    }),
  );
  console.log("Seed completed: Admin Hurlingham inserted (admin@refugiohurlingham.com).");

  const saltSuper = crypto.randomBytes(16).toString("hex");
  const hashSuper = crypto
    .pbkdf2Sync(password, saltSuper, 310000, 32, "sha256")
    .toString("hex");
  await repoUsers.save(
    repoUsers.create({
      name: "Super Admin",
      email: "admin@admin.com",
      passwordHash: hashSuper,
      passwordSalt: saltSuper,
      roleId: CatalogIds.userRole.superadmin,
      refugioId: null,
      emailVerified: true,
    }),
  );
  console.log("Seed completed: Superadmin user inserted (admin@admin.com).");

  // Segundo admin: habilita las conversaciones "Internas" (admin ↔ admin) del
  // panel de Mensajes. Con un solo admin, la pestaña "Internos" siempre daría 0.
  const admin2Salt = crypto.randomBytes(16).toString("hex");
  const admin2Hash = crypto
    .pbkdf2Sync(password, admin2Salt, 310000, 32, "sha256")
    .toString("hex");
  const admin2Saved = await repoUsers.save(
    repoUsers.create({
      name: "Diego Suárez",
      email: "admin2@admin.com",
      passwordHash: admin2Hash,
      passwordSalt: admin2Salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    }),
  );
  try {
    const url = await uploadSeedPhoto(bucket, "diego.png", "users");
    admin2Saved.photo = url;
    await repoUsers.save(admin2Saved);
  } catch (e) {
    console.warn("No se pudo subir imagen de seed para admin2", e);
  }
  console.log("Seed completed: 2º admin insertado (habilita pestaña Internos).");

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

  const extraPetNames = [
    "Bruno",
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
  const extraPetDaysAgo = [1, 3, 8, 22, 2, 13, 30, 6, 40];
  const isoDaysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  // Coordenadas reales (lat, lng) de cada ubicación → habilitan el mapa por
  // cercanía (el front calcula la distancia a "Vos" con turf).
  const extraPetCoords: [number, number][] = [
    [-34.5889, -58.4306], // Plaza Serrano, Palermo
    [-34.628, -58.3697], // Parque Lezama, San Telmo
    [-34.6184, -58.4357], // Parque Rivadavia, Caballito
    [-34.561, -58.4546], // Barrancas de Belgrano
    [-34.6357, -58.4316], // Parque Chacabuco
    [-34.6156, -58.4456], // Plaza Irlanda, Caballito
    [-34.5856, -58.4519], // Parque Los Andes, Chacarita
    [-34.628, -58.4636], // Plaza Pueyrredón, Flores
    [-34.5547, -58.4869], // Parque Saavedra
  ];

  // Vacunación coherente con el estado (sin valores inventados): las que ya están
  // en el circuito del refugio (en adopción / tránsito / tratamiento) salen
  // vacunadas y castradas como parte de la preparación para adopción; las
  // perdidas/encontradas quedan SIN dato (null) porque depende de lo que sepa
  // quien las reporta —se completa al publicar o lo carga el refugio después—.
  const refugioFlowStatuses = new Set<number>([
    CatalogIds.petStatus.adopcion,
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.medico,
  ]);
  const extraPets = [] as any[];
  for (let i = 0; i < extraPetNames.length; i++) {
    const name = extraPetNames[i];
    const enRefugio = refugioFlowStatuses.has(extraPetStatuses[i]);
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
      vaccinated: enRefugio ? true : null,
      neutered: enRefugio ? true : null,
      weightKg: extraPetWeights[i],
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

  // Backfill de coordenadas: las 12 mascotas principales no traen lat/lng, así que
  // no aparecían en el mapa de métricas. Las geocodificamos por su ubicación.
  const GEO_SEED: Record<string, [number, number]> = {
    "Plaza Serrano, Palermo, CABA": [-34.5889, -58.4306],
    "Triunvirato 4200, Villa Urquiza, CABA": [-34.5736, -58.4869],
    "Parque Barrancas de Belgrano, CABA": [-34.561, -58.4546],
    "Av. Rivadavia 4800, Almagro, CABA": [-34.6126, -58.4257],
    "Refugio Patitas Felices, Villa Crespo, CABA": [-34.599, -58.438],
    "Hogar Canino San Telmo, CABA": [-34.6212, -58.3716],
    "Av. Rivadavia 5400, Caballito, CABA": [-34.6184, -58.4357],
    "Junín 1800, Recoleta, CABA": [-34.5875, -58.396],
    "Bulnes 800, Almagro, CABA": [-34.6035, -58.42],
    "Av. Rivadavia 7300, Flores, CABA": [-34.628, -58.4636],
    "Hogar Felino, Boedo, CABA": [-34.628, -58.417],
    "Refugio Huellitas Mininas, Palermo, CABA": [-34.578, -58.425],
  };
  const sinCoords = await repoPets.find();
  let geocodadas = 0;
  for (const p of sinCoords) {
    if ((p.latitud == null || p.longitud == null) && p.location) {
      const c = GEO_SEED[p.location];
      if (c) {
        p.latitud = c[0];
        p.longitud = c[1];
        await repoPets.save(p);
        geocodadas++;
      }
    }
  }
  console.log(`Seed completed: ${geocodadas} mascotas geocodificadas (mapa de métricas).`);

  // Vencimiento de publicaciones: 30 días (perdidas) / 60 días (resto activo) /
  // null (estados terminales). Base = createdAt de cada mascota (así quedan
  // algunas vigentes y otras vencidas para la demo).
  const DAY = 24 * 60 * 60 * 1000;
  const todasMascotas = await repoPets.find();
  let conVencimiento = 0;
  for (const p of todasMascotas) {
    const sid = p.statusId;
    let exp: Date | null = null;
    if (sid !== CatalogIds.petStatus.adoptado && sid !== CatalogIds.petStatus.devueltaAlDueno) {
      const dias = sid === CatalogIds.petStatus.perdido ? 30 : 60;
      const base = p.createdAt ? new Date(p.createdAt) : new Date();
      exp = new Date(base.getTime() + dias * DAY);
      conVencimiento++;
    }
    p.expiresAt = exp;
    await repoPets.save(p);
  }
  console.log(`Seed completed: vencimiento asignado a ${conVencimiento} publicaciones.`);

  // Demo de vencimiento: como el createdAt es reciente, sin esto TODAS quedarían
  // vigentes y el flujo no se podría mostrar. Forzamos 2 publicaciones perdidas
  // ACTIVAS (con dueño) a estado vencido:
  //   - "en gracia" (vencida hace 5 días): sigue visible al público y se puede Renovar.
  //   - "fuera de gracia" (vencida hace 20 días): se oculta del listado público.
  // expiryNotifiedAt = null => el barrido del arranque avisa al dueño ("tu publicación venció").
  const activasPerdidas = (await repoPets.find()).filter(
    (p) =>
      p.statusId === CatalogIds.petStatus.perdido &&
      p.reportStatusId === CatalogIds.petReportStatus.activo &&
      p.userId != null,
  );
  const ahora = Date.now();
  const diasVencidaDemo = [5, 20];
  let vencidasDemo = 0;
  for (let i = 0; i < diasVencidaDemo.length && i < activasPerdidas.length; i++) {
    const p = activasPerdidas[i];
    p.expiresAt = new Date(ahora - diasVencidaDemo[i] * DAY);
    p.expiryNotifiedAt = null;
    await repoPets.save(p);
    vencidasDemo++;
  }
  console.log(`Seed completed: ${vencidasDemo} publicaciones vencidas para demo de vencimiento.`);

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
  // que todas quedarían con la MISMA fecha. Las espaciamos a lo largo del último
  // AÑO (≈33 días entre sí) para que las métricas anuales y la columna "Fecha"
  // del admin tengan recorrido temporal.
  await AppDataSource.query(`
    UPDATE adoption a SET created_at = now() - ((s.rn - 1) * interval '33 days') - (interval '4 days')
    FROM (SELECT id, row_number() OVER (ORDER BY id DESC) AS rn FROM adoption) s
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
    const typeId = (i % 6) + 1301;
    const fu = repoF.create({
      petId: pet.id,
      // Responsable = admin del refugio; el usuario solo figura como ADOPTANTE
      // y únicamente en seguimientos post-adopción.
      userId: adminSaved.id,
      adopterUserId:
        typeId === CatalogIds.followupType.postAdopcion ? user.id : null,
      typeId,
      appointmentAt: appointment,
      statusId: CatalogIds.followupStatus.pendiente,
    });
    followupsToSave.push(fu);
  }
  await repoF.save(followupsToSave);
  console.log(
    `Seed completed: ${followupsToSave.length} seguimientos insertados.`,
  );

  // ============================================================================
  // FLUJOS HISTÓRICOS — DATOS DISTRIBUIDOS A LO LARGO DEL ÚLTIMO AÑO
  // ----------------------------------------------------------------------------
  // Las métricas/dashboard ofrecen un período "1y" y un gráfico "Usuarios por mes"
  // (DATE_TRUNC por mes). Sin datos repartidos en 12 meses esos gráficos muestran
  // una sola barra. Acá sembramos el histórico de TODOS los flujos
  // (usuarios, mascotas adoptadas, solicitudes, seguimientos, avistamientos,
  // comentarios, mensajes, notificaciones y la tabla de actividad) con fechas
  // distribuidas. Las mascotas históricas quedan en estado TERMINAL
  // (adoptado/devuelta) → expiresAt = null, así no se ocultan por vencimiento.
  // ============================================================================
  const MS_DAY = 24 * 60 * 60 * 1000;
  const dAgo = (days: number) => new Date(Date.now() - days * MS_DAY);
  const deaccent = (s: string) =>
    s.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase();
  // Backdatea una columna @CreateDateColumn (TypeORM la pisa con now() en INSERT).
  const bd = (table: string, col: string, id: number | string, date: Date) =>
    AppDataSource.query(
      `UPDATE "${table}" SET "${col}" = $1 WHERE "id" = $2`,
      [date.toISOString(), id],
    );

  // --- USUARIOS repartidos en 12 meses (alimenta "Usuarios por mes") ---------
  // Offsets en días con 2-4 altas por mes (leve crecimiento) → ~36 usuarios.
  const userOffsets: number[] = [];
  for (let m = 11; m >= 0; m--) {
    const perMonth = 2 + (m % 3);
    for (let k = 0; k < perMonth; k++) userOffsets.push(m * 30 + k * 7 + 3);
  }
  const existingUserCount = await repoUsers.count();
  const needHist = Math.max(0, userOffsets.length - existingUserCount);
  const firstPool = [
    "Martín", "Florencia", "Gabriel", "Camila", "Nicolás", "Julieta",
    "Tomás", "Agustina", "Lucas", "Brenda", "Federico", "Rocío",
    "Emiliano", "Carolina", "Joaquín", "Micaela", "Bruno", "Daniela",
    "Iván", "Paula", "Andrés", "Verónica", "Sebastián", "Natalia",
  ];
  const lastPool = [
    "Acosta", "Benítez", "Cabrera", "Domínguez", "Escobar", "Figueroa",
    "Herrera", "Ibáñez", "Juárez", "Ledesma", "Molina", "Navarro",
    "Ortega", "Paredes", "Quiroga", "Ramos", "Sosa", "Torres",
    "Vega", "Wagner", "Costa", "Méndez", "Ríos", "Vera",
  ];
  for (let i = 0; i < needHist; i++) {
    const fn = firstPool[i % firstPool.length];
    const ln = lastPool[(i * 7) % lastPool.length];
    const usalt = crypto.randomBytes(16).toString("hex");
    const uhash = crypto
      .pbkdf2Sync(password, usalt, 310000, 32, "sha256")
      .toString("hex");
    await repoUsers.save(
      repoUsers.create({
        name: `${fn} ${ln}`,
        email: `${deaccent(fn)}.${deaccent(ln)}.h${i}@example.com`,
        passwordHash: uhash,
        passwordSalt: usalt,
        roleId: CatalogIds.userRole.user,
        emailVerified: true,
      }),
    );
  }
  // Aplicar las fechas a TODOS los usuarios (created_at es @CreateDateColumn).
  const allUsersForDates = await repoUsers.find({ order: { id: "ASC" } });
  for (let i = 0; i < allUsersForDates.length; i++) {
    const off = userOffsets[i % userOffsets.length];
    await bd("user", "created_at", allUsersForDates[i].id, dAgo(off));
  }
  console.log(
    `Seed completed: ${needHist} usuarios históricos + ${allUsersForDates.length} con createdAt repartido en 12 meses.`,
  );

  // --- VISTAS de publicaciones (alimenta "Top publicaciones") ----------------
  const petsForViews = await repoPets.find();
  for (let i = 0; i < petsForViews.length; i++) {
    const views = ((i * 53 + 17) % 240) + 8;
    await AppDataSource.query(
      `UPDATE "pet" SET "viewsCount" = $1 WHERE "id" = $2`,
      [views, petsForViews[i].id],
    );
  }
  console.log(`Seed completed: viewsCount asignado a ${petsForViews.length} publicaciones.`);

  // --- MASCOTAS históricas en estado TERMINAL (adoptado/devuelta) ------------
  // Sin vencimiento (expiresAt=null) y reportStatus finalizado → no se ocultan
  // ni inflan "publicaciones activas". Alimentan adopciones/tasaAdopción anuales.
  const histPetNames = [
    "Lola", "Duque", "Nina", "Otto", "Frida", "Rex",
    "Cleo", "Tango", "Olivia", "Bongo", "Lupe", "Ringo",
  ];
  const histPets: { id: string; date: Date; animalTypeId: number; name: string }[] = [];
  for (let i = 0; i < histPetNames.length; i++) {
    const isPerro = i % 2 === 0;
    const status =
      i >= histPetNames.length - 2
        ? CatalogIds.petStatus.devueltaAlDueno
        : CatalogIds.petStatus.adoptado;
    const date = dAgo((i + 1) * 28 + 10); // 38 .. 346 días atrás
    const created = await repoPets.save(
      repoPets.create({
        name: histPetNames[i],
        animalTypeId: isPerro
          ? CatalogIds.animalType.perro
          : CatalogIds.animalType.gato,
        description: `Caso cerrado: ${histPetNames[i]} encontró un hogar. Registro histórico para métricas anuales.`,
        date: date.toISOString().slice(0, 10),
        location: "CABA",
        contactPhone: `117000${String(100 + i)}`,
        contactEmail: `hist${i}@example.com`,
        sexId: isPerro ? CatalogIds.petSex.macho : CatalogIds.petSex.hembra,
        breed: "Mestizo",
        ageMonths: 12 + i,
        color: "Variado",
        weightKg: 5 + i,
        vaccinated: true,
        neutered: true,
        statusId: status,
        reportStatusId: CatalogIds.petReportStatus.finalizado,
        expiresAt: null,
      }),
    );
    histPets.push({ id: created.id, date, animalTypeId: created.animalTypeId, name: created.name! });
  }
  for (const hp of histPets) {
    await AppDataSource.query(
      `UPDATE "pet" SET "createdAt" = $1, "date" = $2 WHERE "id" = $3`,
      [hp.date.toISOString(), hp.date.toISOString().slice(0, 10), hp.id],
    );
  }
  console.log(`Seed completed: ${histPets.length} mascotas históricas (terminal) repartidas en el año.`);

  // --- SOLICITUDES de adopción históricas (terminales) -----------------------
  const regularUsers = (await repoUsers.find()).filter(
    (u) => u.roleId === CatalogIds.userRole.user,
  );
  const histFirst = ["Juan", "Maria", "Carlos", "Ana", "Laura", "Ricardo", "Pedro", "Lucia", "Sofia", "Diego", "Martin", "Paula"];
  const histLast = ["Perez", "Gomez", "Ruiz", "Lopez", "Martinez", "Silva", "Gonzalez", "Rodriguez", "Fernandez", "Diaz", "Acosta", "Vega"];
  const adopterIds = new Set<number>();
  const histAdoptions: { id: string; date: Date }[] = [];
  for (let i = 0; i < histPets.length; i++) {
    const hp = histPets[i];
    const adopter = regularUsers[i % regularUsers.length];
    if (adopter) adopterIds.add(adopter.id);
    // 10 aceptadas (terminó en adopción) + 2 descartadas, coherente con el cierre.
    const status =
      i >= histPets.length - 2
        ? CatalogIds.adoptionStatus.descartada
        : CatalogIds.adoptionStatus.aceptada;
    const a = repoAdopt.create({
      userId: adopter?.id ?? null,
      petId: hp.id,
      preferredAnimalTypeId: hp.animalTypeId,
      firstName: histFirst[i % histFirst.length],
      lastName: histLast[i % histLast.length],
      email: `${histFirst[i % histFirst.length].toLowerCase()}.${histLast[i % histLast.length].toLowerCase()}.h${i}@example.com`,
      phone: `11650000${i}`,
      addressLine1: `Av. Siempreviva ${100 + i}`,
      addressLine2: null,
      postcode: `C10${i}0`,
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
      visitingChildrenId: i % 3 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      hasFlatmatesId: CatalogIds.yesNo.no,
      allergies: null,
      otherAnimalsId: i % 2 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      otherAnimalsDetail: i % 2 === 0 ? "Convive con otra mascota" : null,
      neuteredId: CatalogIds.yesNo.si,
      vaccinatedId: CatalogIds.yesNo.si,
      experience: i % 2 === 0 ? "Experiencia previa con rescatados" : "Primera adopción",
      acceptsTerms: true,
      statusId: status,
      compatibilityScore: 62 + ((i * 7) % 34),
    });
    const saved = await repoAdopt.save(a as any);
    // La solicitud se cargó unos días antes de cerrar el caso.
    const reqDate = new Date(hp.date.getTime() - 4 * MS_DAY);
    histAdoptions.push({ id: (saved as any).id, date: reqDate });
  }
  for (const ha of histAdoptions) await bd("adoption", "created_at", ha.id, ha.date);
  // Marcar como adoptantes a quienes concretaron una adopción.
  if (adopterIds.size > 0) {
    await AppDataSource.query(
      `UPDATE "user" SET adopter = true WHERE id = ANY($1)`,
      [Array.from(adopterIds)],
    );
  }
  console.log(`Seed completed: ${histAdoptions.length} solicitudes históricas (terminales) repartidas en el año.`);

  // --- SEGUIMIENTOS históricos (completados/confirmados) + 2 para HOY ---------
  const histFollowups: { id: number; date: Date }[] = [];
  for (let i = 0; i < histPets.length; i++) {
    const hp = histPets[i];
    const user = regularUsers[i % regularUsers.length];
    if (!user) continue;
    // Cita post-adopción unos días después del cierre del caso.
    const appt = new Date(hp.date.getTime() + 7 * MS_DAY);
    const fu = await repoF.save(
      repoF.create({
        petId: hp.id,
        userId: adminSaved.id, // responsable (admin del refugio)
        adopterUserId: user.id, // adoptante (usuario)
        typeId: CatalogIds.followupType.postAdopcion,
        appointmentAt: appt,
        statusId:
          i % 3 === 0
            ? CatalogIds.followupStatus.confirmado
            : CatalogIds.followupStatus.completado,
      }),
    );
    histFollowups.push({ id: fu.id, date: new Date(hp.date.getTime() + 1 * MS_DAY) });
  }
  for (const hf of histFollowups) await bd("seguimientos", "created_at", hf.id, hf.date);
  // Dos seguimientos con turno HOY → tarjeta "Seguimientos hoy" del dashboard.
  const lostPetsNow = (await repoPets.find()).filter(
    (p) => p.statusId === CatalogIds.petStatus.perdido,
  );
  const hoy = new Date();
  hoy.setHours(11, 0, 0, 0);
  for (let i = 0; i < 2 && i < lostPetsNow.length; i++) {
    const user = regularUsers[i % regularUsers.length];
    if (!user) continue;
    await repoF.save(
      repoF.create({
        petId: lostPetsNow[i].id,
        userId: adminSaved.id, // responsable (admin); una visita no tiene adoptante
        typeId: CatalogIds.followupType.visita,
        appointmentAt: hoy,
        statusId: CatalogIds.followupStatus.pendiente,
      }),
    );
  }
  console.log(`Seed completed: ${histFollowups.length} seguimientos históricos + 2 para hoy.`);

  // --- AVISTAMIENTOS ("La vi") sobre mascotas perdidas -----------------------
  const repoSighting = AppDataSource.getRepository(Sighting);
  const sightingPlaces = [
    "Plaza Serrano, Palermo", "Av. Cabildo y Juramento, Belgrano",
    "Parque Centenario, Caballito", "Estación Once",
    "Av. Rivadavia y Acoyte", "Parque Lezama, San Telmo",
    "Plaza Flores", "Av. Corrientes y Medrano", "Barrancas de Belgrano",
    "Parque Chacabuco",
  ];
  const sightingNotes = [
    "Lo vi cruzando la plaza, parecía asustado.",
    "Estaba tomando agua en una fuente, se fue para el norte.",
    "Una vecina lo tiene en su patio, dejó este contacto.",
    "Lo vi en la esquina con un grupo de chicos.",
    "Pasó corriendo, no pude alcanzarlo.",
    "Está merodeando la zona hace dos días.",
    "Coincide con la foto, tenía collar.",
    "Lo vio el portero del edificio esta mañana.",
    "Andaba cerca del parque, se metió entre los autos.",
    "Una panadería de la zona le da de comer.",
  ];
  let sightingCount = 0;
  for (let i = 0; i < sightingPlaces.length && lostPetsNow.length > 0; i++) {
    const pet = lostPetsNow[i % lostPetsNow.length];
    const reporter = i % 3 === 0 ? null : regularUsers[i % regularUsers.length]?.id ?? null;
    const created = dAgo((i * 11) % 130 + 2); // repartidos en ~4 meses
    const s = await repoSighting.save(
      repoSighting.create({
        petId: pet.id,
        reporterUserId: reporter,
        place: sightingPlaces[i],
        sightedOn: created.toISOString().slice(0, 10),
        note: sightingNotes[i % sightingNotes.length],
        contact: reporter ? null : `11${String(40000000 + i)}`,
      }),
    );
    await bd("sighting", "created_at", s.id, created);
    sightingCount++;
  }
  console.log(`Seed completed: ${sightingCount} avistamientos insertados.`);

  // --- COMENTARIOS públicos en publicaciones (mix aprobado/pendiente) --------
  const repoComment = AppDataSource.getRepository(PetComment);
  const allPetsForComments = await repoPets.find();
  const commentTexts = [
    "¡Ojalá aparezca pronto! Comparto en mi barrio.",
    "Lo vi parecido por la zona, te escribo por privado.",
    "Qué hermoso, espero que encuentre familia.",
    "¿Sigue disponible para adopción?",
    "Estuvimos buscando, cualquier novedad avisamos.",
    "Mucha fuerza, ya va a volver a casa.",
    "Compartido en el grupo del barrio.",
    "¿Tiene chip? Pregunto para difundir mejor.",
    "Hermoso animal, ojalá todo salga bien.",
    "Lo vamos a tener en cuenta, gracias por publicar.",
    "Pasó algo similar con mi mascota, no pierdan la esperanza.",
    "Avisé a la veterinaria de la zona por las dudas.",
  ];
  let commentCount = 0;
  for (let i = 0; i < commentTexts.length && allPetsForComments.length > 0; i++) {
    const pet = allPetsForComments[(i * 3) % allPetsForComments.length];
    const author = regularUsers[i % regularUsers.length];
    const created = dAgo((i * 9) % 150 + 1);
    const status = i % 4 === 0 ? "pending" : "approved";
    const c = await repoComment.save(
      repoComment.create({
        petId: pet.id,
        authorUserId: author?.id ?? null,
        authorName: author?.name ?? "Vecino/a",
        authorEmail: author?.email ?? null,
        text: commentTexts[i],
        status,
      }),
    );
    await bd("pet_comment", "created_at", c.id, created);
    commentCount++;
  }
  console.log(`Seed completed: ${commentCount} comentarios insertados.`);

  // --- MENSAJES entre usuarios y admin (algunos sin leer para el admin) ------
  const adminId = adminSaved.id;
  const msgBodies = [
    "Hola, vi la publicación, ¿sigue disponible?",
    "Buenas, quería consultar por el proceso de adopción.",
    "Gracias por la info, coordino la visita.",
    "¿Puedo pasar este fin de semana a conocerlo?",
    "Perfecto, quedo atento a tu respuesta.",
    "Adjunto una foto de mi casa como me pediste.",
    "Muchas gracias por todo, excelente atención.",
    "¿Necesitan algo más de mi parte?",
  ];
  let msgCount = 0;
  for (let i = 0; i < 16; i++) {
    const user = regularUsers[i % regularUsers.length];
    if (!user) continue;
    const fromUser = i % 2 === 0; // alterna usuario→admin y admin→usuario
    const senderId = fromUser ? user.id : adminId;
    const receiverId = fromUser ? adminId : user.id;
    // Los dirigidos al admin: la mitad sin leer → tarjeta "Mensajes sin leer".
    const read = fromUser ? i % 4 !== 0 : true;
    const created = dAgo((i * 13) % 200 + 1);
    const m = await repoMessages.save(
      repoMessages.create({
        senderId,
        receiverId,
        content: msgBodies[i % msgBodies.length],
        read,
      }),
    );
    await bd("message", "created_at", m.id, created);
    msgCount++;
  }
  console.log(`Seed completed: ${msgCount} mensajes insertados.`);

  // --- MENSAJES INTERNOS (admin ↔ admin) → pestaña "Internos" del panel --------
  // Conversación entre los dos admins (Laura ↔ Diego). Como el otro participante
  // es admin, el front la clasifica como "Interna".
  const internoMsgs: { from: number; to: number; text: string; read: boolean }[] = [
    { from: admin2Saved.id, to: adminId, text: "Laura, ¿revisaste la solicitud de adopción de Duque?", read: true },
    { from: adminId, to: admin2Saved.id, text: "Sí, la pasé a evaluación. Falta coordinar la visita.", read: true },
    { from: admin2Saved.id, to: adminId, text: "Dale. Yo me encargo del seguimiento post-adopción de Max.", read: true },
    { from: adminId, to: admin2Saved.id, text: "Perfecto. Avisame si entra algún reclamo nuevo.", read: true },
    { from: admin2Saved.id, to: adminId, text: "Entró uno de Bruno, te lo derivo para que lo veas.", read: false },
  ];
  let internoCount = 0;
  for (let i = 0; i < internoMsgs.length; i++) {
    const im = internoMsgs[i];
    const created = dAgo(internoMsgs.length - i); // del más viejo al más nuevo
    const m = await repoMessages.save(
      repoMessages.create({
        senderId: im.from,
        receiverId: im.to,
        content: im.text,
        read: im.read,
      }),
    );
    await bd("message", "created_at", m.id, created);
    internoCount++;
  }
  console.log(`Seed completed: ${internoCount} mensajes internos (admin↔admin) insertados.`);

  // --- NOTIFICACIONES in-app (mix leído/no leído) ----------------------------
  const repoNotif = AppDataSource.getRepository(Notification);
  const notifSpecs: { type: string; title: string; body: string; link: string }[] = [
    { type: "comment", title: "Nuevo comentario en tu publicación", body: "Alguien comentó en tu mascota publicada.", link: "/mis-reportes" },
    { type: "avistamiento", title: "¡Reportaron un avistamiento!", body: "Alguien dice haber visto a tu mascota.", link: "/mis-reportes" },
    { type: "adoption_status", title: "Actualización de tu solicitud", body: "El estado de tu solicitud de adopción cambió.", link: "/mis-solicitudes" },
    { type: "message", title: "Tenés un nuevo mensaje", body: "Recibiste un mensaje privado.", link: "/mensajes" },
    { type: "publication", title: "Tu publicación fue aprobada", body: "Ya está visible para la comunidad.", link: "/mis-reportes" },
    { type: "actividad", title: "Recordatorio de seguimiento", body: "Tenés un seguimiento próximo.", link: "/seguimientos" },
  ];
  let notifCount = 0;
  for (let i = 0; i < 15; i++) {
    const user = regularUsers[i % regularUsers.length];
    if (!user) continue;
    const spec = notifSpecs[i % notifSpecs.length];
    const created = dAgo((i * 17) % 120 + 1);
    const n = await repoNotif.save(
      repoNotif.create({
        userId: user.id,
        type: spec.type,
        title: spec.title,
        body: spec.body,
        link: spec.link,
        read: i % 3 === 0, // ~1/3 leídas, el resto sin leer (campana con badge)
      }),
    );
    await bd("notification", "created_at", n.id, created);
    notifCount++;
  }
  console.log(`Seed completed: ${notifCount} notificaciones insertadas.`);

  // --- RECLAMOS demo (carrusel de alertas) -----------------------------------
  // Un reclamo real crea 3 cosas juntas: NOTA en la mascota (lo que lee el
  // carrusel), MENSAJE al admin y NOTIFICACIÓN. Acá lo replicamos para que el
  // carrusel tenga datos consistentes apenas se levanta el proyecto, incluyendo
  // un caso ya cerrado (mascota "devuelta al dueño").
  const repoNote = AppDataSource.getRepository(PetNote);
  const fotoDe = (p: Pet) =>
    p.photo ?? (p.photos && p.photos.length ? p.photos[0] : null);
  const perdidasActivas = (await repoPets.find()).filter(
    (p) =>
      p.statusId === CatalogIds.petStatus.perdido &&
      p.reportStatusId === CatalogIds.petReportStatus.activo,
  );
  const demoClaims = [
    { devuelto: false, motivo: "Es mi perro, lo perdí hace una semana en el barrio." },
    { devuelto: false, motivo: "Reconozco la cicatriz de la oreja, es mía." },
    { devuelto: true, motivo: "Tiene microchip a mi nombre; ya coordinamos la entrega." },
  ];
  let reclamosDemo = 0;
  for (let i = 0; i < demoClaims.length; i++) {
    const c = demoClaims[i];
    const pet = perdidasActivas[i];
    const user = regularUsers[i % regularUsers.length];
    if (!pet || !user) continue;
    const foto = fotoDe(pet);

    // NOTA (la fuente de las alertas del carrusel)
    await repoNote.save(
      repoNote.create({
        petId: pet.id,
        authorName: user.name,
        kindId: CatalogIds.petNoteKind.general,
        text: [
          `🔔 RECLAMO de ${user.name}`,
          `Mensaje: ${c.motivo}`,
          foto ? `Fotos de prueba: ${foto}` : null,
          `Usuario ID: ${user.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    );

    // MENSAJE al admin (mismo formato que un reclamo real)
    const msg = await repoMessages.save(
      repoMessages.create({
        senderId: user.id,
        receiverId: adminId,
        photo: foto,
        read: false,
        content: [
          `🔔 RECLAMO DE MASCOTA`,
          ``,
          `Mascota: ${pet.name ?? "sin nombre"}`,
          `Link: /mascotas-perdidas/${pet.id}`,
          ``,
          `— Datos de quien reclama —`,
          `Nombre: ${user.name}`,
          `Motivo: ${c.motivo}`,
          `Usuario ID: ${user.id}`,
          ``,
          `Respondé a este mensaje para coordinar el reencuentro.`,
        ].join("\n"),
      }),
    );
    await bd("message", "created_at", msg.id, dAgo(i + 1));

    // NOTIFICACIÓN al admin
    const n = await repoNotif.save(
      repoNotif.create({
        userId: adminId,
        type: "message",
        title: `🔔 Reclamo: ${pet.name ?? "mascota"} – ${user.name}`,
        body: "Reclama ser el dueño. Respondé desde Mensajes.",
        link: `/admin/mensajes?user=${user.id}`,
        read: false,
      }),
    );
    await bd("notification", "created_at", n.id, dAgo(i + 1));

    // Caso cerrado: la mascota ya fue devuelta a su dueño.
    if (c.devuelto) {
      pet.statusId = CatalogIds.petStatus.devueltaAlDueno;
      pet.reportStatusId = CatalogIds.petReportStatus.finalizado;
      pet.expiresAt = null;
      await repoPets.save(pet);
    }
    reclamosDemo++;
  }
  console.log(`Seed completed: ${reclamosDemo} reclamos demo (carrusel de alertas).`);

  // --- ACTIVIDAD: backfill desde los datos reales (mismo criterio que el ------
  // script backfill-activity, pero integrado al seed para que quede consistente
  // con todas las fechas distribuidas). createdAt es columna seteable directa.
  const repoActivity = AppDataSource.getRepository(Activity);
  await repoActivity.clear();
  const [actUsers, actAdoptions, actFollowups, actPets, actComments] =
    await Promise.all([
      repoUsers.find(),
      repoAdopt.find(),
      repoF.find(),
      repoPets.find(),
      repoComment.find(),
    ]);
  const actPetName = new Map(actPets.map((p) => [p.id, p.name ?? "una mascota"]));
  const actRows: Partial<Activity>[] = [];
  for (const u of actUsers) {
    actRows.push({ type: "usuario_nuevo", title: `Nuevo usuario: ${u.name}`, actorUserId: u.id, refType: "user", refId: String(u.id), link: "/admin/personas", createdAt: u.createdAt });
    if (u.adopter) actRows.push({ type: "adoptante_nuevo", title: `Nuevo adoptante: ${u.name}`, actorUserId: u.id, refType: "user", refId: String(u.id), link: "/admin/personas", createdAt: u.createdAt });
  }
  for (const a of actAdoptions) {
    if (!a.petId) continue;
    actRows.push({ type: "solicitud", title: `Solicitud de ${a.firstName} ${a.lastName}`.trim(), actorUserId: a.userId, refType: "adoption", refId: String(a.id), link: `/admin/solicitudes?requestId=${a.id}`, createdAt: a.createdAt });
  }
  for (const f of actFollowups) {
    actRows.push({ type: "seguimiento", title: "Seguimiento agendado", actorUserId: f.userId, refType: "followup", refId: String(f.id), link: "/admin/seguimientos", createdAt: f.createdAt });
  }
  for (const p of actPets) {
    actRows.push({ type: "publicacion", title: `Publicación: ${p.name ?? "mascota"}`, actorUserId: p.userId, refType: "pet", refId: p.id, link: "/admin/publicacion", createdAt: p.createdAt });
  }
  for (const c of actComments) {
    actRows.push({ type: "comentario", title: `Comentario en ${actPetName.get(c.petId) ?? "una publicación"}`, actorUserId: c.authorUserId, refType: "comment", refId: String(c.id), link: `/mascotas-perdidas/${c.petId}`, createdAt: c.createdAt });
  }
  await repoActivity.save(repoActivity.create(actRows));
  console.log(`Seed completed: ${actRows.length} registros de actividad (backfill integrado).`);

  // Asignación de refugios: se corre AL FINAL, una vez que existen TODAS las
  // mascotas (incluidas las históricas terminales que crea el bloque de flujos
  // históricos). Si se corriera antes, esas históricas quedarían con
  // refugio_id NULL y se filtrarían como "públicas" en las métricas de todos
  // los refugios. Las mascotas en estados gestionados se reparten entre los dos
  // refugios; adopciones y seguimientos heredan el refugio de su mascota.
  const managedStatuses = [
    CatalogIds.petStatus.encontrado,
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.medico,
    CatalogIds.petStatus.adopcion,
    CatalogIds.petStatus.adoptado,
    CatalogIds.petStatus.devueltaAlDueno,
  ];
  await AppDataSource.query(
    `UPDATE pet p SET refugio_id = CASE WHEN s.rn % 2 = 0 THEN $1::int ELSE $2::int END
     FROM (SELECT id, row_number() OVER (PARTITION BY "statusId" ORDER BY id) AS rn FROM pet WHERE "statusId" = ANY($3)) s
     WHERE p.id = s.id`,
    [refugioMoronId, refugioHurlinghamId, managedStatuses],
  );
  await AppDataSource.query(
    `UPDATE adoption a SET refugio_id = p.refugio_id FROM pet p WHERE a."petId" = p.id`,
  );
  await AppDataSource.query(
    `UPDATE seguimientos f SET refugio_id = p.refugio_id FROM pet p WHERE f.pet_id = p.id`,
  );
  console.log("Seed completed: refugios asignados (moron + hurlingham).");

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
