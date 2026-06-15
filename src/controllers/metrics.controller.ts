import { Request, Response } from "express";
import { AppDataSource } from "../data-source";

import { Pet } from "../entity/Pet";
import { Adoption } from "../entity/Adoption";
import { Followup } from "../entity/Followup";
import { User } from "../entity/User";

import { CatalogIds } from "../lib/catalog-constants";

export async function getMetricas(req: Request, res: Response) {
  try {
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
      AppDataSource.getRepository(Pet).count({
        where: {
          reportStatusId: CatalogIds.petReportStatus.activo,
        },
      }),

      AppDataSource.getRepository(Pet).count({
        where: {
          statusId: CatalogIds.petStatus.adoptado,
        },
      }),

      AppDataSource.getRepository(Pet).count({
        where: {
          statusId: CatalogIds.petStatus.perdido,
        },
      }),

      AppDataSource.getRepository(Followup).count({
        where: {
          statusId: CatalogIds.followupStatus.pendiente,
        },
      }),

      AppDataSource.getRepository(User).count(),

      AppDataSource.getRepository(Pet).count({
        where: {
          statusId: CatalogIds.petStatus.adopcion,
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

    const mascotasPorEstadoRaw = await AppDataSource.createQueryBuilder(
      Pet,
      "p",
    )
      .select("p.statusId", "statusId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("p.statusId")
      .getRawMany();

    const mascotasPorEstado = mascotasPorEstadoRaw.map((item) => ({
      estado: getPetStatusLabel(Number(item.statusId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // SOLICITUDES POR ESTADO
    // ==========================

    const solicitudesPorEstadoRaw = await AppDataSource.createQueryBuilder(
      Adoption,
      "a",
    )
      .select("a.statusId", "statusId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("a.statusId")
      .getRawMany();

    const solicitudesPorEstado = solicitudesPorEstadoRaw.map((item) => ({
      estado: getAdoptionStatusLabel(Number(item.statusId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // SEGUIMIENTOS POR ESTADO
    // ==========================

    const seguimientosPorEstadoRaw = await AppDataSource.createQueryBuilder(
      Followup,
      "f",
    )
      .select("f.statusId", "statusId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("f.statusId")
      .getRawMany();

    const seguimientosPorEstado = seguimientosPorEstadoRaw.map((item) => ({
      estado: getFollowupStatusLabel(Number(item.statusId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // USUARIOS POR MES
    // ==========================

    const usuariosPorMes = await AppDataSource.createQueryBuilder(User, "u")
      .select("TO_CHAR(DATE_TRUNC('month', u.createdAt), 'YYYY-MM')", "mes")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("DATE_TRUNC('month', u.createdAt)")
      .orderBy("DATE_TRUNC('month', u.createdAt)", "ASC")
      .getRawMany();

    // ==========================
    // MASCOTAS POR TIPO
    // ==========================

    const mascotasPorTipoRaw = await AppDataSource.createQueryBuilder(Pet, "p")
      .select("p.animalTypeId", "animalTypeId")
      .addSelect("COUNT(*)", "cantidad")
      .groupBy("p.animalTypeId")
      .getRawMany();

    const mascotasPorTipo = mascotasPorTipoRaw.map((item) => ({
      tipo: getAnimalTypeLabel(Number(item.animalTypeId)),
      cantidad: Number(item.cantidad),
    }));

    // ==========================
    // TOP PUBLICACIONES
    // ==========================

    const topPublicacionesRaw = await AppDataSource.createQueryBuilder(Pet, "p")
      .orderBy("p.viewsCount", "DESC")
      .limit(5)
      .getMany();

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

    const mapaReportesRaw = await AppDataSource.createQueryBuilder(Pet, "p")
      .select([
        "p.id as id",
        "p.name as nombre",
        "p.latitud as lat",
        "p.longitud as lng",
        "p.statusId as statusId",
        "p.animalTypeId as animalTypeId",
      ])
      .where("p.latitud IS NOT NULL")
      .andWhere("p.longitud IS NOT NULL")
      .getRawMany();

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
