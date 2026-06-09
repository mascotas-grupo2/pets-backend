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
    {
      name: "Toby",
      animalTypeId: CatalogIds.animalType.perro,
      description: "Perro marron, amigable, ideal para departamento si sale a pasear.",
      date: "2026-04-22",
      location: "Vergara 2396, Villa Tesei",
      contactPhone: "1134567890",
      contactEmail: "contacto1@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Mezcla",
      ageMonths: 24,
      color: "Marron",
      weightKg: 18,
      heightCm: 45,
      hasCollar: true,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: true,
      activityLevelId: CatalogIds.activityLevel.moderado,
      statusId: CatalogIds.petStatus.adopcion,
      reportStatusId: CatalogIds.petReportStatus.activo,
    },
    {
      name: "Luna",
      animalTypeId: CatalogIds.animalType.gato,
      description: "Es una gata naranja, muy tranquila, duerme todo el día.",
      date: "2026-04-22",
      location: "Adolfo Alsina 2256, Florida, Buenos Aires",
      contactPhone: "1198765432",
      contactEmail: "contacto2@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Naranja",
      ageMonths: 12,
      color: "Naranja",
      weightKg: 4.2,
      friendlyWithKids: false,
      friendlyWithPets: false,
      activityLevelId: CatalogIds.activityLevel.tranquilo,
      statusId: CatalogIds.petStatus.adopcion,
      reportStatusId: CatalogIds.petReportStatus.activo,
    },
    {
      name: "Max",
      animalTypeId: CatalogIds.animalType.perro,
      description: "Perro atigrado, encontrado cerca del parque, muy juguetón y activo.",
      date: "2026-05-10",
      location: "Parque Centenario, Buenos Aires",
      contactPhone: "1144455566",
      contactEmail: "contacto3@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Atigrado",
      ageMonths: 36,
      color: "Atigrado",
      weightKg: 20,
      vaccinated: true,
      friendlyWithKids: true,
      friendlyWithPets: true,
      activityLevelId: CatalogIds.activityLevel.activo,
      statusId: CatalogIds.petStatus.adopcion,
      reportStatusId: CatalogIds.petReportStatus.activo,
    },
    {
      name: "Misi",
      animalTypeId: CatalogIds.animalType.gato,
      description: "Gata pequeña encontrada, muy cariñosa y activa.",
      date: "2026-05-12",
      location: "Palermo, Buenos Aires",
      contactPhone: "1145566677",
      contactEmail: "contacto4@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Común",
      ageMonths: 8,
      color: "Blanca",
      weightKg: 3.5,
      vaccinated: false,
      friendlyWithKids: true,
      friendlyWithPets: true,
      activityLevelId: CatalogIds.activityLevel.activo,
      statusId: CatalogIds.petStatus.adopcion,
      reportStatusId: CatalogIds.petReportStatus.activo,
    },
    { name: "Rex", animalTypeId: CatalogIds.animalType.perro, description: "Perro joven, requiere mucho patio y ejercicios largos.", date: "2026-05-01", location: "Recoleta", contactPhone: "1140000001", contactEmail: "rex@example.com", sexId: CatalogIds.petSex.macho, breed: "Labrador", ageMonths: 30, color: "Negro", weightKg: 25, vaccinated: true, friendlyWithKids: true, friendlyWithPets: false, activityLevelId: CatalogIds.activityLevel.activo, statusId: CatalogIds.petStatus.adopcion, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Nina", animalTypeId: CatalogIds.animalType.gato, description: "Gata casera, buena con niños, pero asustadiza con otros gatos.", date: "2026-05-02", location: "Caballito", contactPhone: "1140000002", contactEmail: "nina@example.com", sexId: CatalogIds.petSex.hembra, breed: "Siames", ageMonths: 18, color: "Gris", weightKg: 4.0, vaccinated: true, friendlyWithKids: true, friendlyWithPets: false, activityLevelId: CatalogIds.activityLevel.moderado, statusId: CatalogIds.petStatus.adopcion, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Oso", animalTypeId: CatalogIds.animalType.perro, description: "Perro grande, protector, ideal para el campo o grandes jardines.", date: "2026-05-03", location: "Lanús", contactPhone: "1140000003", contactEmail: "oso@example.com", sexId: CatalogIds.petSex.macho, breed: "Mastín", ageMonths: 48, color: "Café", weightKg: 40, vaccinated: true, friendlyWithKids: false, friendlyWithPets: false, activityLevelId: CatalogIds.activityLevel.tranquilo, statusId: CatalogIds.petStatus.adopcion, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Mora", animalTypeId: CatalogIds.animalType.gato, description: "Gata tímida, necesita paciencia, no compatible con niños pequeños.", date: "2026-05-04", location: "Belgrano", contactPhone: "1140000004", contactEmail: "mora@example.com", sexId: CatalogIds.petSex.hembra, breed: "Común", ageMonths: 14, color: "Atigrada", weightKg: 3.8, vaccinated: true, friendlyWithKids: false, friendlyWithPets: true, activityLevelId: CatalogIds.activityLevel.tranquilo, statusId: CatalogIds.petStatus.adopcion, reportStatusId: CatalogIds.petReportStatus.activo },
  ];

  const createdPets: { id: string; name: string | null }[] = [];
  for (const item of petsData) {
    // create pet first to obtain id, then upload seed image into folder named by pet id
    const created = await repoPets.save(repoPets.create(item));
    createdPets.push({ id: created.id, name: created.name ?? null });
    // determine seed image by name (simple mapping)
    let seedFile = "";
    if ((created.name || "").toLowerCase().startsWith("toby")) seedFile = "toby.png";
    if ((created.name || "").toLowerCase().startsWith("luna")) seedFile = "luna.png";
    if (seedFile) {
      try {
        const url = await uploadSeedPhoto(bucket, seedFile, String(created.id));
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
      name: "Admin",
      email: "admin@admin.com",
      passwordHash: hash,
      passwordSalt: salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    })
  );
  console.log("Seed completed: Admin user inserted (role=admin).");

  // Add two regular users (role = user)
  const usersToCreate = [
    { name: "Usuario Uno", email: "user1@example.com" },
    { name: "Usuario Dos", email: "user2@example.com" },
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
    createdUsers.push({ id: saved.id, email: saved.email });
  }
  // include admin in the createdUsers array for easier referencing
  createdUsers.unshift({ id: adminSaved.id, email: adminSaved.email });
  console.log("Seed completed: 2 usuarios insertados (role=user).");

  // Add more users to reach ~10 regular users
  const moreUsers: { name: string; email: string }[] = [];
  for (let i = 3; i <= 10; i++) moreUsers.push({ name: `Usuario ${i}`, email: `user${i}@example.com` });
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
    "Diego",
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
    });
  }
  const createdExtraPets = [] as any[];
  for (const p of extraPets) {
    const created = await repoPets.save(repoPets.create(p));
    createdExtraPets.push(created);
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
    const userId = deterministicUserIds[i % deterministicUserIds.length];
    const petId = deterministicPetIds[i % deterministicPetIds.length];
    const appointment = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000); // i+1 days in future
    const fu = repoF.create({
      petId: petId,
      userId: userId,
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
