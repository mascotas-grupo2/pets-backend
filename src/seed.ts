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
import { CatalogIds } from "./lib/catalog-constants.js";
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

async function uploadSeedPhoto(bucket: string, fileName: string, folder?: string) {
  const filePath = path.join(seedAssetsDir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`No se encontro la imagen de seed: ${filePath}`);
  }

  // Use uploadFileToMinio to place the file under a folder (e.g., pet id)
  const buffer = readFileSync(filePath);
  return uploadFileToMinio(bucket, folder ?? "", fileName, buffer, contentTypeForFile(fileName));
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
      statusId: CatalogIds.petStatus.perdido,
      description: "Perro labrador color dorado, muy cariñoso. Lleva collar rojo. Tiene una pequeña cicatriz en la oreja derecha.",
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
      seedImage: "toby.png",
    },    {
      name: "Coco",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.perdido,
      description: "Caniche toy color caramelo. Responde a su nombre. Lleva collar con cascabel.",
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
      seedImage: "coco.png",
    },

    // ============= PERROS ENCONTRADOS =============
    {
      name: "Bobi",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.encontrado,
      description: "Perro mestizo tamaño mediano, marrón con patas blancas. Sin collar. Muy amigable, parece bien cuidado.",
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
      seedImage: "bobi.png",
    },
    {
      name: "Manchas",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.encontrado,
      description: "Perro chico negro con manchas blancas en el pecho. Tenía collar rosa sin chapita.",
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
      seedImage: "manchas.png",
    },

    // ============= PERROS EN ADOPCIÓN =============
    {
      name: "Max",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.adopcion,
      description: "Perro mestizo de 2 años rescatado de la calle. Castrado, vacunado, desparasitado. Bueno con chicos y otros perros. Necesita una familia paciente que le dé tiempo de adaptación.",
      date: "2026-05-15",
      location: "Refugio Patitas Felices, Villa Crespo, CABA",
      contactPhone: "1155667788",
      contactEmail: "adopciones@patitasfelices.example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Mestizo",
      ageMonths: 24,
      color: "Negro",
      weightKg: 18,
      neutered: true,
      vaccinated: true,
      friendlyWithKids: true,
      trained: true,
      seedImage: "max.png",
    },
    {
      name: "Rocco",
      animalTypeId: CatalogIds.animalType.perro,
      statusId: CatalogIds.petStatus.adopcion,
      description: "Bulldog francés joven, súper sociable. Energético, ideal para una familia con espacio. Castrado y al día con sus vacunas.",
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
      seedImage: "rocco.png",
    },

    // ============= GATOS PERDIDOS =============
    {
      name: "Pelusa",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.perdido,
      description: "Gata blanca con manchas grises en el lomo. Asustadiza con extraños pero busca cariño una vez en confianza.",
      date: "2026-05-25",
      location: "Av. Rivadavia 5400, Caballito, CABA",
      contactPhone: "1166778899",
      contactEmail: "matias.pelusa@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Común europeo",
      ageMonths: 24,
      color: "Blanco y gris",
      weightKg: 4,
      hasCollar: false,
      microchipped: true,
      neutered: true,
      seedImage: "pelusa.png",
    },
    {
      name: "Simba",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.perdido,
      description: "Gato naranja persa, muy peludo. Se escapó por una ventana. Tiene microchip y collar con chapita.",
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
      seedImage: "simba.png",
    },

    // ============= GATOS ENCONTRADOS =============
    {
      name: "Michi",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.encontrado,
      description: "Gata atigrada chiquita, parece joven. Maúlla mucho. La encontramos en el patio de un edificio.",
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
      seedImage: "michi.png",
    },
    {
      name: "Salem",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.encontrado,
      description: "Gato negro adulto, ojos verdes muy expresivos. Vino solo a la puerta de mi casa. Está flaco pero parece sano.",
      date: "2026-05-29",
      location: "Av. Rivadavia 7300, Flores, CABA",
      contactPhone: "1144332211",
      contactEmail: "rescata.flores@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Común europeo",
      ageMonths: 36,
      color: "Negro",
      weightKg: 3,
      seedImage: "salem.png",
    },

    // ============= GATOS EN ADOPCIÓN =============
    {
      name: "Mishi",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.adopcion,
      description: "Gata adulta calma y mimosa, ideal para departamento. Esterilizada, al día con vacunas. Convive bien con otros gatos.",
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
      seedImage: "mishi.png",
    },
    {
      name: "Luna",
      animalTypeId: CatalogIds.animalType.gato,
      statusId: CatalogIds.petStatus.adopcion,
      description: "Gata joven, naranja con blanco, muy juguetona y curiosa. Buena con otros gatos. Esterilizada, al día con vacunas y desparasitación.",
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
      seedImage: "luna.png",
    },
  ];

  const createdPets: { id: string; name: string | null }[] = [];
  for (const item of petsData) {
    // El campo `seedImage` es opcional y solo está presente en algunas
    // mascotas del dataset. Lo extraemos antes de persistir.
    const { seedImage, ...petFields } = item as any;
    const created = await repoPets.save(
      repoPets.create(petFields as Partial<Pet>),
    );
    createdPets.push({ id: created.id, name: created.name ?? null });
    if (seedImage) {
      try {
        const url = await uploadSeedPhoto(bucket, seedImage, String(created.id));
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
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  const adminSaved = await repoUsers.save(
    repoUsers.create({
      name: "Laura Fernández",
      email: "admin@admin.com",
      passwordHash: hash,
      passwordSalt: salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    })
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
    { name: "Juan Pérez", email: "juan.perez@example.com", seedImage: "juan.png" },
    { name: "María Gómez", email: "maria.gomez@example.com", seedImage: "maria.png" },
    { name: "Cberto", email: "cberto021@gmail.com", seedImage: "carlos.png" },
  ];
  const createdUsers: { id: number; email: string }[] = [];
  for (const u of usersToCreate) {
    const usalt = crypto.randomBytes(16).toString("hex");
    const uhash = crypto.pbkdf2Sync(password, usalt, 310000, 32, "sha256").toString("hex");
    const saved = await repoUsers.save(
      repoUsers.create({
        name: u.name,
        email: u.email,
        passwordHash: uhash,
        passwordSalt: usalt,
        roleId: CatalogIds.userRole.user,
        emailVerified: true,
      })
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
    "Carlos Ruiz", "Ana López", "Ricardo Martínez", "Pedro Silva",
    "Lucía González", "Sofía Rodríguez", "Diego Fernández", "Valentina Díaz"
  ];
  const moreUsers: { name: string; email: string; seedImage: string }[] = [];
  for (let i = 0; i < realNames.length; i++) {
    const nameParts = realNames[i].toLowerCase().split(" ");
    const firstName = nameParts[0].replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u');
    const lastName = nameParts[1].replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u');
    moreUsers.push({ 
      name: realNames[i], 
      email: `${firstName}.${lastName}@example.com`,
      seedImage: `${firstName}.png`
    });
  }
  for (const u of moreUsers) {
    const usalt = crypto.randomBytes(16).toString("hex");
    const uhash = crypto.pbkdf2Sync(password, usalt, 310000, 32, "sha256").toString("hex");
    const saved = await repoUsers.save(
      repoUsers.create({
        name: u.name,
        email: u.email,
        passwordHash: uhash,
        passwordSalt: usalt,
        roleId: CatalogIds.userRole.user,
        emailVerified: true,
      })
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

  const extraPets = [] as any[];
  for (let i = 0; i < extraPetNames.length; i++) {
    const name = extraPetNames[i];
    extraPets.push({
      name,
      animalTypeId: i % 2 === 0 ? CatalogIds.animalType.perro : CatalogIds.animalType.gato,
      description: extraPetDescriptions[i],
      date: "2026-05-01",
      location: `Barrio ${i + 1}, Ciudad`,
      contactPhone: `11500000${i + 1}`,
      contactEmail: `pet${i + 1}@example.com`,
      sexId: i % 2 === 0 ? CatalogIds.petSex.macho : CatalogIds.petSex.hembra,
      breed: "Común",
      ageMonths: 6 + i,
      color: "Mixto",
      weightKg: 3 + i,
      vaccinated: i % 3 !== 0,
      friendlyWithKids: i % 2 === 0,
      friendlyWithPets: i % 4 !== 0,
      activityLevelId: i % 3 === 0 ? CatalogIds.activityLevel.tranquilo : (i % 3 === 1 ? CatalogIds.activityLevel.moderado : CatalogIds.activityLevel.activo),
      statusId: CatalogIds.petStatus.adopcion,
      reportStatusId: CatalogIds.petReportStatus.activo,
      seedImage: extraPetImages[i],
    });
  }
  const createdExtraPets = [] as any[];
  for (const p of extraPets) {
    const { seedImage, ...petFields } = p as any;
    const created = await repoPets.save(repoPets.create(petFields as Partial<Pet>));
    createdExtraPets.push(created);
    if (seedImage) {
      try {
        const url = await uploadSeedPhoto(bucket, seedImage, String(created.id));
        created.photos = [url];
        await repoPets.save(created);
      } catch (e) {
        console.warn("No se pudo subir imagen de seed para pet adicional", created.id, e);
      }
    }
  }
  console.log(`Seed completed: ${createdExtraPets.length} mascotas adicionales insertadas (reportStatus=activo).`);

  // Refresh lists of users and pets to reference in adoptions and followups
  // Refresh lists of users and pets to reference in adoptions and followups
  const allUsers = await repoUsers.find();
  const allPets = await repoPets.find();
  // Build deterministic lists of created pet ids and user ids for tests
  const deterministicPetIds = [...createdPets.map((p) => p.id), ...createdExtraPets.map((p) => p.id)];
  const deterministicUserIds = createdUsers.map((u) => u.id);

  // Create ~10 adoption requests
  const repoAdopt = repoAdoption; // already defined above
  const adoptionSamples = [] as Adoption[];
  const firstNames = ["Juan", "Maria", "Carlos", "Ana", "Laura", "Ricardo", "Pedro", "Lucia", "Sofia", "Diego"];
  const lastNames = ["Perez", "Gomez", "Ruiz", "Lopez", "Martinez", "Silva", "Gonzalez", "Rodriguez", "Fernandez", "Diaz"];

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
      livingSituationId: i % 2 === 0 ? CatalogIds.livingSituation.casa : CatalogIds.livingSituation.departamento,
      householdSettingId: CatalogIds.householdSetting.urbano,
      activityLevelId: i % 3 === 0 ? CatalogIds.activityLevel.activo : (i % 3 === 1 ? CatalogIds.activityLevel.moderado : CatalogIds.activityLevel.tranquilo),
      adults: (i % 3) + 1,
      children: i % 4,
      visitingChildrenId: i % 3 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      hasFlatmatesId: CatalogIds.yesNo.no,
      allergies: i === 5 ? "Tengo alergia a los gatos" : null,
      otherAnimalsId: i % 2 === 0 ? CatalogIds.yesNo.si : CatalogIds.yesNo.no,
      otherAnimalsDetail: i % 2 === 0 ? "Tengo un perro pequeño" : null,
      neuteredId: CatalogIds.yesNo.si,
      vaccinatedId: CatalogIds.yesNo.si,
      experience: i % 2 === 0 ? "Tengo experiencia previa con mascotas rescatadas" : "Es mi primera mascota",
      acceptsTerms: true,
      statusId: Object.values(CatalogIds.adoptionStatus)[i % Object.values(CatalogIds.adoptionStatus).length],
      compatibilityScore: null,
    });
    
    // Calculate compatibility score
    if (pet) {
      a.compatibilityScore = calculateCompatibility(a, pet).score;
    }
    
    adoptionSamples.push(a as any);
  }
  await repoAdopt.save(adoptionSamples);
  console.log(`Seed completed: ${adoptionSamples.length} solicitudes de adopción insertadas.`);

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
      typeId: ((i % 6) + 1301),
      appointmentAt: appointment,
      statusId: CatalogIds.followupStatus.pendiente,
    });
    followupsToSave.push(fu);
  }
  await repoF.save(followupsToSave);
  console.log(`Seed completed: ${followupsToSave.length} seguimientos insertados.`);

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
