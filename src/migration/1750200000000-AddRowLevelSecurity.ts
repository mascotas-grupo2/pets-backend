import { MigrationInterface, QueryRunner } from "typeorm";

const RLS_TABLES = ["pet", "adoption", "seguimientos", "activity"];
const APP_ROLE = "pets_app";
const TENANT_EXPR = `(coalesce(current_setting('app.is_superadmin', true), '') <> 'on' AND (coalesce(current_setting('app.current_refugio', true), '') = '' OR "refugio_id"::text = current_setting('app.current_refugio', true) OR "refugio_id" IS NULL))`;

export class AddRowLevelSecurity1750200000000 implements MigrationInterface {
  name = "AddRowLevelSecurity1750200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN CREATE ROLE "${APP_ROLE}" NOLOGIN; END IF; END $$;`,
    );
    await q.query(`GRANT "${APP_ROLE}" TO CURRENT_USER`);
    await q.query(`GRANT USAGE ON SCHEMA public TO "${APP_ROLE}"`);
    await q.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_ROLE}"`,
    );
    await q.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${APP_ROLE}"`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_ROLE}"`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${APP_ROLE}"`,
    );

    for (const t of RLS_TABLES) {
      await q.query(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
      await q.query(`DROP POLICY IF EXISTS "${t}_tenant" ON "${t}"`);
      await q.query(
        `CREATE POLICY "${t}_tenant" ON "${t}" FOR ALL USING ${TENANT_EXPR} WITH CHECK ${TENANT_EXPR}`,
      );
    }
    await q.query(`DROP POLICY IF EXISTS "pet_public_read" ON "pet"`);
    await q.query(
      `CREATE POLICY "pet_public_read" ON "pet" FOR SELECT USING ("reportStatusId" = 1102 AND coalesce(current_setting('app.is_superadmin', true), '') <> 'on')`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP POLICY IF EXISTS "pet_public_read" ON "pet"`);
    for (const t of RLS_TABLES) {
      await q.query(`DROP POLICY IF EXISTS "${t}_tenant" ON "${t}"`);
      await q.query(`ALTER TABLE "${t}" DISABLE ROW LEVEL SECURITY`);
    }
    await q.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${APP_ROLE}"`);
    await q.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "${APP_ROLE}"`);
    await q.query(`REVOKE USAGE ON SCHEMA public FROM "${APP_ROLE}"`);
  }
}
