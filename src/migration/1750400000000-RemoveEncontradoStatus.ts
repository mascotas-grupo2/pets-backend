import { MigrationInterface, QueryRunner } from "typeorm";

// Elimina el estado "Encontrado" (202) del catálogo de estados de mascota.
//
// Contexto: "encontrado" nació para representar un avistaje comunitario (un
// vecino ve un animal perdido y lo reporta), pero durante el desarrollo se lo
// reinterpretó como "animal que un refugio ingresó y está en tratamiento". Ese
// doble sentido se elimina: los avistajes pasan a ser "perdido" y los ingresos
// de refugio a "en tránsito".
//
// Migración de datos por-mascota, según su naturaleza (discriminador: refugio_id):
//   - sin refugio (refugio_id IS NULL)  = avistaje comunitario -> perdido (201)
//   - con refugio (refugio_id NOT NULL) = ingreso de refugio   -> en tránsito (203)
export class RemoveEncontradoStatus1750400000000 implements MigrationInterface {
  name = "RemoveEncontradoStatus1750400000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE "pet" SET "statusId" = 201 WHERE "statusId" = 202 AND "refugio_id" IS NULL`,
    );
    await q.query(
      `UPDATE "pet" SET "statusId" = 203 WHERE "statusId" = 202 AND "refugio_id" IS NOT NULL`,
    );
    await q.query(`DELETE FROM "catalog_value" WHERE "id" = 202`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Restaura la fila de catálogo. La reasignación de estados no se puede
    // deshacer con exactitud (se pierde qué mascota era "encontrado"), así que
    // el down solo recrea el valor de catálogo.
    await q.query(
      `INSERT INTO "catalog_value" ("id", "catalog", "code", "label")
       VALUES (202, 'pet_status', 'encontrado', 'Encontrado')
       ON CONFLICT ("id") DO NOTHING`,
    );
  }
}
