import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { Adoption } from "../entity/Adoption.js";
import { Followup } from "../entity/Followup.js";
import { Message } from "../entity/Message.js";
import { CatalogIds } from "../lib/catalog-constants.js";

/** Conteos reales para las cards del dashboard del admin. */
export async function getDashboardStats(req: Request, res: Response) {
  const petRepo = AppDataSource.getRepository(Pet);
  const adoptionRepo = AppDataSource.getRepository(Adoption);
  const followupRepo = AppDataSource.getRepository(Followup);
  const messageRepo = AppDataSource.getRepository(Message);

  const userId = req.authUser?.id ?? null;

  // Mascotas: "activas" = todas menos las perdidas; y aparte el conteo de perdidas.
  const totalPets = await petRepo.count();
  const perdidas = await petRepo.count({
    where: { statusId: CatalogIds.petStatus.perdido },
  });
  const activas = totalPets - perdidas;

  const solicitudes = await adoptionRepo.count();

  // Seguimientos con turno para hoy.
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  const seguimientosHoy = await followupRepo
    .createQueryBuilder("f")
    .where("f.appointmentAt BETWEEN :inicio AND :fin", { inicio, fin })
    .getCount();

  const mensajesSinLeer = userId
    ? await messageRepo.count({ where: { receiverId: userId, read: false } })
    : 0;

  res.json({
    mascotasActivas: activas,
    mascotasPerdidas: perdidas,
    solicitudes,
    seguimientosHoy,
    publicaciones: totalPets,
    mensajesSinLeer,
  });
}
