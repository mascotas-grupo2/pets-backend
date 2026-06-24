import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { dbManager } from "../lib/db-context"; // Importa AppDataSource
import { MoreThanOrEqual } from "typeorm"; // Importa MoreThanOrEqual para filtros de fecha

import { Pet } from "../entity/Pet";
import { Adoption } from "../entity/Adoption";
import { Followup } from "../entity/Followup";
import { User } from "../entity/User";

import { CatalogIds } from "../lib/catalog-constants"; // Importa CatalogIds
import { applyTenantScope, tenantWhere } from "../lib/tenant";

// Define el tipo MetricasFilter para consistencia con el frontend
type MetricasFilter = "7d" | "30d" | "90d" | "1y";

export async function getMetricas(req: Request, res: Response) {
  try {
    const periodo = req.query.periodo as MetricasFilter | undefined;
    let startDate: Date | undefined;

    if (periodo) {
      startDate = new Date();
      switch (periodo) {
        case "7d": startDate.setDate(startDate.getDate() - 7); break;
        case "30d": startDate.setDate(startDate.getDate() - 30); break;
        case "90d": startDate.setDate(startDate.getDate() - 90); break;
        case "1y": startDate.setFullYear(startDate.getFullYear() - 1); break;
        default: startDate = undefined; // No aplicar filtro si el período es inválido
      }
    }
    const dateFilter = startDate ? MoreThanOrEqual(startDate) : undefined;
    // ==========================
    // KPI SUPERIORES
    // ==========================

    const [
      mascotasPublicadas,
      mascotasAdoptadas,
      mascotasPerdidas,
      seguimientosPendientes,
      usuariosRegistrados,
      mascotasEnAdopcion,
    ] = await Promise.all([
      dbManager().getRepository(Pet).count({
        where: {
          reportStatusId: CatalogIds.petReportStatus.activo,
          ...tenantWhere(req.authUser),
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),

      dbManager().getRepository(Pet).count({
        where: {
          statusId: CatalogIds.petStatus.adoptado,
          ...tenantWhere(req.authUser),
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),

      dbManager().getRepository(Pet).count({
        where: {
          statusId: CatalogIds.petStatus.perdido,
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),

      dbManager().getRepository(Followup).count({
        where: {
          statusId: CatalogIds.followupStatus.pendiente,
          ...tenantWhere(req.authUser),
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),

      dbManager().getRepository(User).count({
        where: {
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),

      dbManager().getRepository(Pet).count({
        where: {
          statusId: CatalogIds.petStatus.adopcion,
          ...tenantWhere(req.authUser),
          ...(dateFilter && { createdAt: dateFilter }),
        },
      }),
    ]);

    // Para el KPI "mascotasPublicadas" y la "tasaAdopcion", es más relevante considerar
    // las mascotas que están o estuvieron en el proceso de adopción.
    const mascotasPublicadasParaAdopcion = mascotasAdoptadas + mascotasEnAdopcion;
    const tasaAdopcion =
      mascotasPublicadasParaAdopcion > 0
        ? Number(((mascotasAdoptadas / mascotasPublicadasParaAdopcion) * 100).toFixed(1))
        : 0;

    // ==========================
    // MASCOTAS POR ESTADO
    // ==========================

    const mascotasPorEstadoQb = dbManager().createQueryBuilder(Pet, "p")
      .select("p.statusId", "statusId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("p.statusId");
    applyTenantScope(mascotasPorEstadoQb, "p", req.authUser);

    if (startDate) {
      mascotasPorEstadoQb.andWhere("p.createdAt >= :startDate", { startDate });
    }

    const mascotasPorEstadoRaw = await mascotasPorEstadoQb.getRawMany();

    const mascotasPorEstado = mascotasPorEstadoRaw.map((item) => ({
      estado: getPetStatusLabel(Number(item.statusId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // SOLICITUDES POR ESTADO
    // ==========================

    const solicitudesPorEstadoQb = dbManager().createQueryBuilder(Adoption, "a")
      .select("a.statusId", "statusId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("a.statusId");
    applyTenantScope(solicitudesPorEstadoQb, "a", req.authUser);

    if (startDate) {
      solicitudesPorEstadoQb.andWhere("a.createdAt >= :startDate", { startDate });
    }

    const solicitudesPorEstadoRaw = await solicitudesPorEstadoQb.getRawMany();

    const solicitudesPorEstado = solicitudesPorEstadoRaw.map((item) => ({
      estado: getAdoptionStatusLabel(Number(item.statusId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // SEGUIMIENTOS POR ESTADO
    // ==========================

    const seguimientosPorEstadoQb = dbManager().createQueryBuilder(Followup, "f")
      .select("f.statusId", "statusId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("f.statusId");
    applyTenantScope(seguimientosPorEstadoQb, "f", req.authUser);

    if (startDate) {
      seguimientosPorEstadoQb.andWhere("f.createdAt >= :startDate", { startDate });
    }

    const seguimientosPorEstadoRaw = await seguimientosPorEstadoQb.getRawMany();

    const seguimientosPorEstado = seguimientosPorEstadoRaw.map((item) => ({
      estado: getFollowupStatusLabel(Number(item.statusId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // USUARIOS POR MES
    // ==========================

    const usuariosPorMesQb = dbManager().createQueryBuilder(User, "u")
      .select("TO_CHAR(DATE_TRUNC('month', u.createdAt), 'YYYY-MM')", "mes")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("DATE_TRUNC('month', u.createdAt)")
      .orderBy("DATE_TRUNC('month', u.createdAt)", "ASC");

    if (startDate) {
      usuariosPorMesQb.andWhere("u.createdAt >= :startDate", { startDate });
    }
    const usuariosPorMes = await usuariosPorMesQb.getRawMany();

    // ==========================
    // MASCOTAS POR TIPO
    // ==========================

    const mascotasPorTipoQb = dbManager().createQueryBuilder(Pet, "p")
      .select("p.animalTypeId", "animalTypeId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("p.animalTypeId");
    applyTenantScope(mascotasPorTipoQb, "p", req.authUser);

    if (startDate) {
      mascotasPorTipoQb.andWhere("p.createdAt >= :startDate", { startDate });
    }

    const mascotasPorTipoRaw = await mascotasPorTipoQb.getRawMany();

    const mascotasPorTipo = mascotasPorTipoRaw.map((item) => ({
      tipo: getAnimalTypeLabel(Number(item.animalTypeId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // TOP PUBLICACIONES
    // ==========================

    const topPublicacionesQb = dbManager().createQueryBuilder(Pet, "p")
      .orderBy("p.viewsCount", "DESC")
      .limit(5);
    applyTenantScope(topPublicacionesQb, "p", req.authUser);

    if (startDate) {
      topPublicacionesQb.andWhere("p.createdAt >= :startDate", { startDate });
    }

    const topPublicacionesRaw = await topPublicacionesQb.getMany();

    const topPublicaciones = topPublicacionesRaw.map((pet) => ({
      id: pet.id,
      titulo: pet.name ?? "Sin nombre",
      vistas: pet.viewsCount ?? 0,
      avatar: pet.photo || (pet.photos && pet.photos?.length > 0 && pet.photos[0]) || null,
      especie: getAnimalTypeLabel(pet.animalTypeId),
      estado: getPetStatusLabel(pet.statusId),
    }));

    // ==========================
    // MAPA REPORTES
    // ==========================

    const mapaReportesQb = dbManager().createQueryBuilder(Pet, "p")
      .select([
        "p.id as id",
        "p.name as nombre",
        "p.latitud as lat",
        "p.longitud as lng",
        "p.statusId as statusId",
        "p.animalTypeId as animalTypeId",
      ])
      .where("p.latitud IS NOT NULL")
      .andWhere("p.longitud IS NOT NULL");

    if (startDate) {
      mapaReportesQb.andWhere("p.createdAt >= :startDate", { startDate });
    }

    const mapaReportesRaw = await mapaReportesQb.getRawMany();

    const mapaReportes = mapaReportesRaw.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      lat: Number(item.lat),
      lng: Number(item.lng),
      estado: getPetStatusLabel(Number(item.statusId)),
      tipo: getAnimalTypeLabel(Number(item.animalTypeId)),
    }));

    return res.json({
      ok: true,

      data: {
        kpis: {
          mascotasPublicadas,
          mascotasAdoptadas,
          mascotasPerdidas,
          tasaAdopcion,
          seguimientosPendientes,
          usuariosRegistrados,
        },

        mascotasPorEstado,
        solicitudesPorEstado,
        seguimientosPorEstado,
        usuariosPorMes,
        mascotasPorTipo,
        topPublicaciones,
        mapaReportes,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Error al obtener métricas",
    });
  }
}

// ==================================================
// HELPERS
// ==================================================

function getAnimalTypeLabel(id: number) {
  switch (id) {
    case CatalogIds.animalType.perro:
      return "perro";

    case CatalogIds.animalType.gato:
      return "gato";

    case CatalogIds.animalType.otro:
      return "otro";

    default:
      return "Sin clasificar";
  }
}
function getPetStatusLabel(id: number) {
  switch (id) {
    case CatalogIds.petStatus.perdido:
      return "perdido";

    case CatalogIds.petStatus.encontrado:
      return "encontrado";

    case CatalogIds.petStatus.transito:
      return "en tránsito";

    case CatalogIds.petStatus.medico:
      return "en tratamiento médico";

    case CatalogIds.petStatus.adopcion:
      return "en adopción";

    case CatalogIds.petStatus.adoptado:
      return "adoptado";

    default:
      return "Otro";
  }
}

function getAdoptionStatusLabel(id: number) {
  switch (id) {
    case CatalogIds.adoptionStatus.nueva:
      return "Pendiente";

    case CatalogIds.adoptionStatus.enEvaluacion:
      return "En evaluación";

    case CatalogIds.adoptionStatus.entrevistaPendiente:
      return "Entrevista";

    case CatalogIds.adoptionStatus.aceptadaConSeguimiento:
      return "Aprobada con seguimiento";

    case CatalogIds.adoptionStatus.aceptada:
      return "Aprobada";

    case CatalogIds.adoptionStatus.descartada:
      return "Rechazada";

    default:
      return "Otro";
  }
}

function getFollowupStatusLabel(id: number) {
  switch (id) {
    case CatalogIds.followupStatus.pendiente:
      return "Pendiente";

    case CatalogIds.followupStatus.confirmado:
      return "Confirmado";

    case CatalogIds.followupStatus.completado:
      return "Completado";

    default:
      return "Otro";
  }
}
