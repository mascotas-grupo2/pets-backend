import "dotenv/config";
import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppDataSource } from "./data-source.js";
import { Pet, AnimalType, PetSex } from "./entity/Pet.js";
import { User, UserRole } from "./entity/User.js";
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

  const repoPets = AppDataSource.getRepository(Pet);
  await repoPets.clear();

  const bucket = process.env.MINIO_BUCKET ?? "report-images";

  const petsData = [
    {
      name: "Toby",
      animalType: AnimalType.PERRO,
      // photos will be uploaded per-pet below
      description: "Perro marron, amigable, llevaba collar azul cuando fue visto",
      date: "2026-04-22",
      location: "Vergara 2396, Villa Tesei",
      contactPhone: "1134567890",
      contactEmail: "contacto1@example.com",
      sex: PetSex.MACHO,
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
      animalType: AnimalType.GATO,
      // photos will be uploaded per-pet below
      description: "Es una gata naranja, se la veia tranquila y podemos tenerla hasta nuevo aviso",
      date: "2026-04-22",
      location: "Adolfo Alsina 2256, Florida, Buenos Aires",
      contactPhone: "1198765432",
      contactEmail: "contacto2@example.com",
      sex: PetSex.HEMBRA,
      breed: "Naranja",
      ageMonths: 12,
      color: "Naranja",
      weightKg: 4.2,
    },
  ];

  for (const item of petsData) {
    // create pet first to obtain id, then upload seed image into folder named by pet id
    const created = await repoPets.save(repoPets.create(item));
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
  repoUsers.clear();
  const password = "Admin1234!";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  await repoUsers.save(
    repoUsers.create({
      name: "Admin",
      email: "admin@admin.com",
      passwordHash: hash,
      passwordSalt: salt,
      role: UserRole.ADMIN,
      emailVerified: true,
    })
  );
  console.log("Seed completed: Admin user inserted (role=admin).");

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
