import "dotenv/config";
import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppDataSource } from "./data-source.js";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";
import { Followup } from "./entity/Followup.js";
import { Adoption } from "./entity/Adoption.js";
import { CatalogIds } from "./lib/catalog-constants.js";
import { uploadFileToMinio } from "./lib/minio.js";

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
      animalTypeId: 1,
      // photos will be uploaded per-pet below
      description: "Perro marron, amigable, llevaba collar azul cuando fue visto",
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
    },
    {
      name: "Luna",
      animalTypeId: 2,
      // photos will be uploaded per-pet below
      description: "Es una gata naranja, se la veia tranquila y podemos tenerla hasta nuevo aviso",
      date: "2026-04-22",
      location: "Adolfo Alsina 2256, Florida, Buenos Aires",
      contactPhone: "1198765432",
      contactEmail: "contacto2@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Naranja",
      ageMonths: 12,
      color: "Naranja",
      weightKg: 4.2,
    },
    {
      name: "Max",
      animalTypeId: 1,
      description: "Perro atigrado, encontrado cerca del parque, muy juguetón",
      date: "2026-05-10",
      location: "Parque Centenario, Buenos Aires",
      contactPhone: "1144455566",
      contactEmail: "contacto3@example.com",
      sexId: CatalogIds.petSex.macho,
      breed: "Atigrado",
      ageMonths: 36,
      color: "Atigrado",
      weightKg: 20,
      reportStatusId: CatalogIds.petReportStatus.activo,
    },
    {
      name: "Misi",
      animalTypeId: 2,
      description: "Gata pequeña encontrada, muy cariñosa",
      date: "2026-05-12",
      location: "Palermo, Buenos Aires",
      contactPhone: "1145566677",
      contactEmail: "contacto4@example.com",
      sexId: CatalogIds.petSex.hembra,
      breed: "Común",
      ageMonths: 8,
      color: "Blanca",
      weightKg: 3.5,
      reportStatusId: CatalogIds.petReportStatus.activo,
    },
    // Additional seed pets (~10)
    { name: "Rex", animalTypeId: 1, description: "Perro en adopción, juguetón", date: "2026-05-01", location: "Recoleta", contactPhone: "1140000001", contactEmail: "rex@example.com", sexId: CatalogIds.petSex.macho, breed: "Labrador", ageMonths: 30, color: "Negro", weightKg: 25, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Nina", animalTypeId: 2, description: "Gata casera, buena con niños", date: "2026-05-02", location: "Caballito", contactPhone: "1140000002", contactEmail: "nina@example.com", sexId: CatalogIds.petSex.hembra, breed: "Siames", ageMonths: 18, color: "Gris", weightKg: 4.0, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Oso", animalTypeId: 1, description: "Perro grande, protector", date: "2026-05-03", location: "Lanús", contactPhone: "1140000003", contactEmail: "oso@example.com", sexId: CatalogIds.petSex.macho, breed: "Mastín", ageMonths: 48, color: "Café", weightKg: 40, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Mora", animalTypeId: 2, description: "Gata tímida, necesita paciencia", date: "2026-05-04", location: "Belgrano", contactPhone: "1140000004", contactEmail: "mora@example.com", sexId: CatalogIds.petSex.hembra, breed: "Común", ageMonths: 14, color: "Atigrada", weightKg: 3.8, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Tito", animalTypeId: 1, description: "Perro mayor, tranquilo", date: "2026-05-05", location: "San Telmo", contactPhone: "1140000005", contactEmail: "tito@example.com", sexId: CatalogIds.petSex.macho, breed: "Beagle", ageMonths: 84, color: "Tricolor", weightKg: 12, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Coco", animalTypeId: 1, description: "Cachorro, necesita socialización", date: "2026-05-06", location: "Villa Crespo", contactPhone: "1140000006", contactEmail: "coco@example.com", sexId: CatalogIds.petSex.macho, breed: "Mix", ageMonths: 6, color: "Blanco", weightKg: 6, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Lola", animalTypeId: 2, description: "Gata mayor, cariñosa", date: "2026-05-07", location: "Constitución", contactPhone: "1140000007", contactEmail: "lola@example.com", sexId: CatalogIds.petSex.hembra, breed: "Común", ageMonths: 72, color: "Marrón", weightKg: 4.5, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Kilo", animalTypeId: 1, description: "Perro en tránsito, amistoso", date: "2026-05-08", location: "Florencio Varela", contactPhone: "1140000008", contactEmail: "kilo@example.com", sexId: CatalogIds.petSex.macho, breed: "Mix", ageMonths: 20, color: "Atigrado", weightKg: 16, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Michi", animalTypeId: 2, description: "Gatito rescatado, juguetón", date: "2026-05-09", location: "Morón", contactPhone: "1140000009", contactEmail: "michi@example.com", sexId: CatalogIds.petSex.hembra, breed: "Común", ageMonths: 4, color: "Negra", weightKg: 2.2, reportStatusId: CatalogIds.petReportStatus.activo },
    { name: "Pepa", animalTypeId: 2, description: "Gata encontrada, sociable", date: "2026-05-11", location: "Olivos", contactPhone: "1140000010", contactEmail: "pepa@example.com", sexId: CatalogIds.petSex.hembra, breed: "Común", ageMonths: 10, color: "Blanca", weightKg: 3.1, reportStatusId: CatalogIds.petReportStatus.activo },
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
      animalTypeId: i % 2 === 0 ? 1 : 2,
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
  for (let i = 1; i <= 10; i++) {
    const user = allUsers[i % allUsers.length];
    const pet = allPets[i % allPets.length];
    const a = repoAdopt.create({
      userId: user?.id ?? null,
      petId: pet?.id ?? null,
      preferredAnimalTypeId: pet?.animalTypeId ?? null,
      firstName: `Adoptante${i}`,
      lastName: `Apellido${i}`,
      email: `adoptante${i}@example.com`,
      phone: `11600000${i}`,
      addressLine1: `Calle ${i} #${i}`,
      addressLine2: null,
      postcode: `C100${i}`,
      town: `Ciudad${i}`,
      hasGardenId: null,
      livingSituationId: null,
      householdSettingId: null,
      activityLevelId: null,
      adults: 2,
      children: 0,
      visitingChildrenId: null,
      hasFlatmatesId: null,
      allergies: null,
      otherAnimalsId: null,
      otherAnimalsDetail: null,
      neuteredId: null,
      vaccinatedId: null,
      experience: "Tengo experiencia previa con mascotas",
      acceptsTerms: true,
      statusId: CatalogIds.adoptionStatus.nueva,
      compatibilityScore: null,
    });
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
