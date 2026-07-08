import { MigrationInterface, QueryRunner } from "typeorm";

// Agrega el estado "Rechazado" (1314) al catálogo de estados de seguimiento.
// Se usa cuando el refugio rechaza un seguimiento post-adopción: la solicitud se
// descarta y la publicación de la mascota vuelve a activarse (disponible para otro
// adoptante).
export class AddFollowupRechazadoStatus1750900000000
  implements MigrationInterface
{
  name = "AddFollowupRechazadoStatus1750900000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO "catalog_value" ("id", "catalog", "code", "label")
       VALUES (1314, 'followup_status', 'RECHAZADO', 'Rechazado')
       ON CONFLICT ("id") DO NOTHING`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "catalog_value" WHERE "id" = 1314`);
  }
}
