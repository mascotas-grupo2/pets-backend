import "dotenv/config";
import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppDataSource } from "./data-source.js";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";
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
    return null;
  }
  const buffer = readFileSync(filePath);
  return uploadFileToMinio(
    bucket,
    folder ?? "",
    fileName,
    buffer,
    contentTypeForFile(fileName),
  );
}

/**
 * Dataset variado para la demo del chatbot:
 *   - 2 perros perdidos, 2 perros encontrados, 2 perros en adopción
 *   - 2 gatos perdidos, 2 gatos encontrados, 2 gatos en adopción
 * Total: 12 mascotas, una por cada combinación (animalType x status).
 */
const PETS_DATA = [
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
  },
  {
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
  },

  // ============= PERROS ENCONTRADOS =============
  {
    name: null,
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
  },
  {
    name: null,
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
  },

  // ============= GATOS ENCONTRADOS =============
  {
    name: null,
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
  },
  {
    name: null,
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

async function seed() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const repoPets = AppDataSource.getRepository(Pet);
  await repoPets.clear();

  const bucket = process.env.MINIO_BUCKET ?? "report-images";

  for (const item of PETS_DATA) {
    const { seedImage, ...petFields } = item as any;
    const created = await repoPets.save(
      repoPets.create(petFields as Partial<Pet>),
    );

    // Subir imagen del seed si la mascota tiene asset asociado
    if (seedImage) {
      try {
        const url = await uploadSeedPhoto(bucket, seedImage, String(created.id));
        if (url) {
          created.photos = [url];
          await repoPets.save(created);
        }
      } catch (e) {
        console.warn("No se pudo subir imagen de seed para pet", created.id, e);
      }
    }
  }
  console.log(`Seed completed: ${PETS_DATA.length} pets inserted.`);

  const repoUsers = AppDataSource.getRepository(User);
  await repoUsers.clear();
  const password = "Admin1234!";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  await repoUsers.save(
    repoUsers.create({
      name: "Admin",
      email: "admin@admin.com",
      passwordHash: hash,
      passwordSalt: salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    }),
  );
  console.log("Seed completed: Admin user inserted (role=admin, email=admin@admin.com, password=Admin1234!).");

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
