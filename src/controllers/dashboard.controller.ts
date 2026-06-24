import { Request, Response } from "express";
import { In, IsNull, Not } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Pet } from "../entity/Pet.js";
import { Adoption } from "../entity/Adoption.js";
import { Followup } from "../entity/Followup.js";
import { Message } from "../entity/Message.js";
import { User } from "../entity/User.js";
import { PetComment } from "../entity/PetComment.js";
import { CatalogIds } from "../lib/catalog-constants.js";
import { applyTenantScope, petVisibilityWhere, tenantWhere } from "../lib/tenant.js";

/** Conteos reales para las cards del dashboard del admin. */
export async function getDashboardStats(req: Request, res: Response) {
  const petRepo = dbManager().getRepository(Pet);
  const adoptionRepo = dbManager().getRepository(Adoption);
  const followupRepo = dbManager().getRepository(Followup);
  const messageRepo = dbManager().getRepository(Message);

  const userId = req.authUser?.id ?? null;

  // Mascotas "activas" = casos abiertos (todas menos las adoptadas). Las perdidas
  // son un SUBCONJUNTO de las activas (por eso el badge "N perdidas" tiene sentido).
  const totalPets = await petRepo.count({ where: petVisibilityWhere({}, req.authUser) });
  const adoptadas = await petRepo.count({
    where: { statusId: CatalogIds.petStatus.adoptado, ...tenantWhere(req.authUser) },
  });
  const perdidas = await petRepo.count({
    where: { statusId: CatalogIds.petStatus.perdido },
  });
  const activas = totalPets - adoptadas;

  // Solo solicitudes reales (con mascota); las filas sin petId son perfiles de
  // adoptante, no solicitudes (igual criterio que el panel de Solicitudes).
  const solicitudesQb = adoptionRepo
    .createQueryBuilder("a")
    .where("a.petId IS NOT NULL");
  applyTenantScope(solicitudesQb, "a", req.authUser);
  const solicitudes = await solicitudesQb.getCount();

  // Seguimientos con turno para hoy.
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  const seguimientosHoyQb = followupRepo
    .createQueryBuilder("f")
    .where("f.appointmentAt BETWEEN :inicio AND :fin", { inicio, fin });
  applyTenantScope(seguimientosHoyQb, "f", req.authUser);
  const seguimientosHoy = await seguimientosHoyQb.getCount();

  const mensajesSinLeer = userId
    ? await messageRepo.count({ where: { receiverId: userId, read: false } })
    : 0;

  // "Publicaciones" = publicaciones visibles (reportStatus activo), no todas las
  // mascotas (que incluían pendientes/rechazadas/finalizadas/adoptadas).
  const publicaciones = await petRepo.count({
    where: { reportStatusId: CatalogIds.petReportStatus.activo, ...tenantWhere(req.authUser) },
  });

  res.json({
    mascotasActivas: activas,
    mascotasPerdidas: perdidas,
    solicitudes,
    seguimientosHoy,
    publicaciones,
    mensajesSinLeer,
  });
}

/**
 * Feed de "actividad reciente" para el dashboard. Se DERIVA de los datos reales
 * (últimas solicitudes, mensajes, publicaciones, usuarios y comentarios),
 * mergeados por fecha. Cada ítem trae un `link` para redirigir al evento.
 */
export async function getDashboardActivity(req: Request, res: Response) {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit ?? 8)));
  const take = limit;

  const petRepo = dbManager().getRepository(Pet);
  const adoptionRepo = dbManager().getRepository(Adoption);
  const userRepo = dbManager().getRepository(User);
  const messageRepo = dbManager().getRepository(Message);
  const commentRepo = dbManager().getRepository(PetComment);

  const [adoptions, messages, pets, users, comments] = await Promise.all([
    adoptionRepo.find({ where: { petId: Not(IsNull()), ...tenantWhere(req.authUser) }, order: { createdAt: "DESC" }, take }),
    messageRepo.find({ order: { createdAt: "DESC" }, take }),
    petRepo.find({ where: petVisibilityWhere({}, req.authUser), order: { createdAt: "DESC" }, take }),
    userRepo.find({ order: { createdAt: "DESC" }, take }),
    commentRepo.find({ order: { createdAt: "DESC" }, take }),
  ]);

  // Resolver nombres en lote (mascotas para solicitudes/comentarios, usuarios para mensajes).
  const petIds = [
    ...new Set([
      ...adoptions.map((a) => a.petId).filter((x): x is string => !!x),
      ...comments.map((c) => c.petId),
    ]),
  ];
  const senderIds = [...new Set(messages.map((m) => m.senderId))];
  const [petRows, senderRows] = await Promise.all([
    petIds.length ? petRepo.findBy({ id: In(petIds) }) : Promise.resolve([]),
    senderIds.length ? userRepo.findBy({ id: In(senderIds) }) : Promise.resolve([]),
  ]);
  const petName = new Map(petRows.map((p) => [p.id, p.name ?? "una mascota"]));
  const senderName = new Map(senderRows.map((u) => [u.id, u.name]));

  type Item = {
    id: string;
    type: "solicitud" | "mensaje" | "publicacion" | "usuario" | "comentario";
    title: string;
    detail: string;
    link: string;
    at: Date;
  };
  const items: Item[] = [];

  for (const a of adoptions) {
    items.push({
      id: `sol-${a.id}`,
      type: "solicitud",
      title: `Nueva solicitud para ${a.petId ? petName.get(a.petId) ?? "una mascota" : "una mascota"}`,
      detail: `${a.firstName} ${a.lastName}`.trim() || "Un usuario",
      link: `/admin/solicitudes?requestId=${a.id}`,
      at: a.createdAt,
    });
  }
  for (const m of messages) {
    items.push({
      id: `msg-${m.id}`,
      type: "mensaje",
      title: "Nuevo mensaje",
      detail: senderName.get(m.senderId) ?? "Alguien escribió",
      link: `/admin/mensajes?user=${m.senderId}`,
      at: m.createdAt,
    });
  }
  for (const p of pets) {
    items.push({
      id: `pub-${p.id}`,
      type: "publicacion",
      title: `Nueva publicación: ${p.name ?? "mascota"}`,
      detail: p.location ?? "",
      link: `/admin/publicacion`,
      at: p.createdAt,
    });
  }
  for (const u of users) {
    items.push({
      id: `usr-${u.id}`,
      type: "usuario",
      title: "Nuevo usuario",
      detail: u.name,
      link: `/admin/personas`,
      at: u.createdAt,
    });
  }
  for (const c of comments) {
    items.push({
      id: `com-${c.id}`,
      type: "comentario",
      title: `Comentario en ${petName.get(c.petId) ?? "una publicación"}`,
      detail: c.authorName,
      link: `/mascotas-perdidas/${c.petId}`,
      at: c.createdAt,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  res.json(items.slice(0, limit));
}
