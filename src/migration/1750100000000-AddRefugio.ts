import { MigrationInterface, QueryRunner } from "typeorm";

const SCOPED = [
  { table: "user", column: "refugio_id", index: "IDX_user_refugio" },
  { table: "pet", column: "refugio_id", index: "IDX_pet_refugio" },
  { table: "adoption", column: "refugio_id", index: "IDX_adoption_refugio" },
  { table: "seguimientos", column: "refugio_id", index: "IDX_seguimientos_refugio" },
  { table: "activity", column: "refugio_id", index: "IDX_activity_refugio" },
] as const;

export class AddRefugio1750100000000 implements MigrationInterface {
  name = "AddRefugio1750100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refugio" (
        "id" SERIAL NOT NULL,
        "name" character varying(160) NOT NULL,
        "slug" character varying(80) NOT NULL,
        "email" character varying(200),
        "phone" character varying(30),
        "location" character varying(200),
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refugio_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refugio_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (503, 'user_role', 'superadmin', 'Superadministrador')
      ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query(
      `UPDATE "catalog_value" SET "label" = 'Administrador de refugio' WHERE "id" = 502`,
    );

    for (const { table, column, index } of SCOPED) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" integer`,
      );
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD CONSTRAINT "FK_${table}_${column}_refugio"
        FOREIGN KEY ("${column}") REFERENCES "refugio"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${index}" ON "${table}" ("${column}")`,
      );
    }

    await queryRunner.query(`
      INSERT INTO "refugio" ("name","slug","location","active")
      VALUES ('Refugio Morón', 'refugio-moron', 'Av. Rivadavia 18500, Morón, Buenos Aires', true)
      ON CONFLICT ("slug") DO NOTHING
    `);

    const defaultId = `(SELECT "id" FROM "refugio" WHERE "slug" = 'refugio-moron')`;

    await queryRunner.query(
      `UPDATE "user" SET "refugio_id" = ${defaultId} WHERE "role_id" = 502`,
    );
    await queryRunner.query(
      `UPDATE "pet" SET "refugio_id" = ${defaultId} WHERE "statusId" IN (202, 203, 204, 205, 206, 207)`,
    );
    await queryRunner.query(
      `UPDATE "adoption" SET "refugio_id" = ${defaultId}`,
    );
    await queryRunner.query(
      `UPDATE "seguimientos" SET "refugio_id" = ${defaultId}`,
    );
    await queryRunner.query(
      `UPDATE "activity" SET "refugio_id" = ${defaultId}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column, index } of SCOPED) {
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."${index}"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_${column}_refugio"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column}"`,
      );
    }

    await queryRunner.query(
      `UPDATE "user" SET "role_id" = 502 WHERE "role_id" = 503`,
    );
    await queryRunner.query(`DELETE FROM "catalog_value" WHERE "id" = 503`);
    await queryRunner.query(
      `UPDATE "catalog_value" SET "label" = 'Administrador' WHERE "id" = 502`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "refugio"`);
  }
}
