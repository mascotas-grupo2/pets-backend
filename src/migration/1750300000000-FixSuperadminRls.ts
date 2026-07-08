import { MigrationInterface, QueryRunner } from "typeorm";

// Corrige las políticas de tenant creadas en AddRowLevelSecurity.
//
// La expresión original era `is_superadmin <> 'on' AND (...)`: para el superadmin
// (is_superadmin='on') el primer término era falso → NINGUNA política del `pet`
// (ni el tenant ni pet_public_read) lo habilitaba → el superadmin veía 0 filas,
// incluidas las públicas (perdidas/encontradas). El superadmin debe ver TODO a
// nivel DB; la restricción de qué gestiona se aplica en la capa de app/rutas.
const RLS_TABLES = ["pet", "adoption", "seguimientos", "activity"];

// Nueva: superadmin ('on') ve todo; el resto ve su refugio, las públicas
// (refugio_id NULL), o todas si no hay contexto de refugio (ej. navegación pública).
const TENANT_EXPR_NEW = `(coalesce(current_setting('app.is_superadmin', true), '') = 'on' OR coalesce(current_setting('app.current_refugio', true), '') = '' OR "refugio_id"::text = current_setting('app.current_refugio', true) OR "refugio_id" IS NULL)`;

// Original (para poder revertir).
const TENANT_EXPR_OLD = `(coalesce(current_setting('app.is_superadmin', true), '') <> 'on' AND (coalesce(current_setting('app.current_refugio', true), '') = '' OR "refugio_id"::text = current_setting('app.current_refugio', true) OR "refugio_id" IS NULL))`;

export class FixSuperadminRls1750300000000 implements MigrationInterface {
  name = "FixSuperadminRls1750300000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const t of RLS_TABLES) {
      await q.query(`DROP POLICY IF EXISTS "${t}_tenant" ON "${t}"`);
      await q.query(
        `CREATE POLICY "${t}_tenant" ON "${t}" FOR ALL USING ${TENANT_EXPR_NEW} WITH CHECK ${TENANT_EXPR_NEW}`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of RLS_TABLES) {
      await q.query(`DROP POLICY IF EXISTS "${t}_tenant" ON "${t}"`);
      await q.query(
        `CREATE POLICY "${t}_tenant" ON "${t}" FOR ALL USING ${TENANT_EXPR_OLD} WITH CHECK ${TENANT_EXPR_OLD}`,
      );
    }
  }
}
