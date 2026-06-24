import "dotenv/config";
import { In, IsNull, Not } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Activity } from "../entity/Activity.js";
import { Pet } from "../entity/Pet.js";
import { Adoption } from "../entity/Adoption.js";
import { Followup } from "../entity/Followup.js";
import { User } from "../entity/User.js";
import { PetComment } from "../entity/PetComment.js";

/**
 * Rellena la tabla `activity` a partir de los datos existentes (usuarios,
 * adoptantes, solicitudes, seguimientos, publicaciones, comentarios). Idempotente:
 * borra y reconstruye. Útil para métricas/documentación sobre la data del seed.
 *
 * Uso: npm run backfill:activity
 */
async function main() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const activityRepo = AppDataSource.getRepository(Activity);
  await activityRepo.clear();

  const [users, adoptions, followups, pets, comments] = await Promise.all([
    AppDataSource.getRepository(User).find(),
    AppDataSource.getRepository(Adoption).find({ where: { petId: Not(IsNull()) } }),
    AppDataSource.getRepository(Followup).find(),
    AppDataSource.getRepository(Pet).find(),
    AppDataSource.getRepository(PetComment).find(),
  ]);

  // Nombres de mascotas para títulos.
  const petName = new Map(pets.map((p) => [p.id, p.name ?? "una mascota"]));

  const rows: Partial<Activity>[] = [];

  for (const u of users) {
    rows.push({
      type: "usuario_nuevo",
      title: `Nuevo usuario: ${u.name}`,
      actorUserId: u.id,
      refType: "user",
      refId: String(u.id),
      link: "/admin/personas",
      createdAt: u.createdAt,
    });
    if (u.adopter) {
      rows.push({
        type: "adoptante_nuevo",
        title: `Nuevo adoptante: ${u.name}`,
        actorUserId: u.id,
        refType: "user",
        refId: String(u.id),
        link: "/admin/personas",
        createdAt: u.createdAt,
      });
  }
}
for (const a of adoptions) {
    rows.push({
      type: "solicitud",
      title: `Solicitud de ${a.firstName} ${a.lastName}`.trim(),
      actorUserId: a.userId,
      refType: "adoption",
      refId: String(a.id),
      link: `/admin/solicitudes?requestId=${a.id}`,
      createdAt: a.createdAt,
    });
  }
  for (const f of followups) {
    rows.push({
      type: "seguimiento",
      title: "Seguimiento agendado",
      actorUserId: f.userId,
      refType: "followup",
      refId: String(f.id),
      link: "/admin/seguimientos",
      createdAt: f.createdAt,
    });
  }
  for (const p of pets) {
    rows.push({
      type: "publicacion",
      title: `Publicación: ${p.name ?? "mascota"}`,
      actorUserId: p.userId,
      refType: "pet",
      refId: p.id,
      link: "/admin/publicacion",
      createdAt: p.createdAt,
    });
  }
  for (const c of comments) {
    rows.push({
      type: "comentario",
      title: `Comentario en ${petName.get(c.petId) ?? "una publicación"}`,
      actorUserId: c.authorUserId,
      refType: "comment",
      refId: String(c.id),
      link: `/mascotas-perdidas/${c.petId}`,
      createdAt: c.createdAt,
    });
  }

  await activityRepo.save(activityRepo.create(rows));

  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type as string] = (byType[r.type as string] ?? 0) + 1;
  console.log(`[backfill-activity] Insertadas ${rows.length} actividades:`, byType);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error("[backfill-activity] error:", e);
  process.exit(1);
});
