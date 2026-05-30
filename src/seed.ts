import "dotenv/config";
import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppDataSource } from "./data-source.js";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";
import { Conversation } from "./chat/conversation.entity.js";
import { ConversationParticipant } from "./chat/participant.entity.js";
import { Message } from "./chat/message.entity.js";
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

  const repoPets = AppDataSource.getRepository(Pet);
  await repoPets.clear();

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
  await repoUsers.clear();

  const hashPassword = (password: string) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
    return { salt, hash };
  };

  const adminPwd = hashPassword("Admin1234!");
  const admin = await repoUsers.save(
    repoUsers.create({
      name: "Admin",
      email: "admin@admin.com",
      passwordHash: adminPwd.hash,
      passwordSalt: adminPwd.salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    })
  );

  const operadorPwd = hashPassword("Operador1234!");
  const operador = await repoUsers.save(
    repoUsers.create({
      name: "Operador",
      email: "operador@admin.com",
      passwordHash: operadorPwd.hash,
      passwordSalt: operadorPwd.salt,
      roleId: CatalogIds.userRole.admin,
      emailVerified: true,
    })
  );
  console.log("Seed completed: usuarios admin y operador insertados.");

  await seedChat(admin.id, operador.id);

  await AppDataSource.destroy();
}

/**
 * Conversaciones de ejemplo. Cada una tiene un miembro del staff (usuario real)
 * y una contraparte invitada (sin usuario). El admin participa de las primeras y
 * el operador de la última: así se ve la membresía en acción.
 */
async function seedChat(adminId: number, operadorId: number) {
  const convRepo = AppDataSource.getRepository(Conversation);
  const partRepo = AppDataSource.getRepository(ConversationParticipant);
  const msgRepo = AppDataSource.getRepository(Message);

  // DELETE (no TRUNCATE) para respetar los FK: primero hijos, luego la conversación.
  await msgRepo.createQueryBuilder().delete().execute();
  await partRepo.createQueryBuilder().delete().execute();
  await convRepo.createQueryBuilder().delete().execute();

  const data = [
    {
      subject: "Solicitud de adopción de Luna",
      context: "Solicitud de Luna",
      channel: "usuario" as const,
      petName: "Luna",
      staffId: adminId,
      member: { name: "María Gómez", email: "maria@email.com", phone: "11 2233-4455" },
      msgs: [
        { staff: false, text: "Hola! Me gustaría saber más sobre Luna y coordinar una entrevista." },
        { staff: true, text: "¡Hola María! Claro, Luna está disponible. Podemos coordinar una entrevista 😊" },
        { staff: false, text: "Perfecto, tengo disponibilidad mañana a las 16 hs." },
      ],
    },
    {
      subject: "Seguimiento de Toby",
      context: "Seguimiento de Toby",
      channel: "usuario" as const,
      petName: "Toby",
      staffId: adminId,
      member: { name: "Juan Pérez", email: "jperez@email.com", phone: "11 3344-5566" },
      msgs: [
        { staff: false, text: "Toby se está adaptando muy bien a la casa." },
        { staff: true, text: "¡Qué buena noticia! Gracias por el update." },
      ],
    },
    {
      subject: "Caso clínico de Nina",
      context: "Caso de Nina",
      channel: "interno" as const,
      petName: "Nina",
      staffId: adminId,
      member: { name: "Equipo Veterinario", email: "vet@refugio.org", phone: "Interno" },
      msgs: [
        { staff: false, text: "Nina necesita control post-operatorio esta semana." },
        { staff: false, text: "¿Coordinamos para el jueves?" },
      ],
    },
    {
      subject: "Consulta general",
      context: "Consulta general",
      channel: "usuario" as const,
      petName: null,
      staffId: operadorId,
      member: { name: "Ana López", email: "ana@email.com", phone: "11 5566-7788" },
      msgs: [{ staff: false, text: "¿Cómo es el proceso de adopción?" }],
    },
  ];

  for (const c of data) {
    const conv = await convRepo.save(
      convRepo.create({
        subject: c.subject,
        context: c.context,
        channel: c.channel,
        petName: c.petName,
        lastMessageAt: new Date(),
      }),
    );
    await partRepo.save(
      partRepo.create({ conversationId: conv.id, userId: c.staffId, displayName: "Refugio", role: "admin" }),
    );
    await partRepo.save(
      partRepo.create({
        conversationId: conv.id,
        userId: null,
        displayName: c.member.name,
        email: c.member.email,
        phone: c.member.phone,
        role: "member",
      }),
    );
    for (const m of c.msgs) {
      await msgRepo.save(
        msgRepo.create({
          conversationId: conv.id,
          senderUserId: m.staff ? c.staffId : null,
          senderName: m.staff ? "Refugio" : c.member.name,
          text: m.text,
        }),
      );
    }
  }
  console.log(`Seed completed: ${data.length} conversaciones con participantes y mensajes.`);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
