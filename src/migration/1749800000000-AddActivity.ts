import { MigrationInterface, QueryRunner } from "typeorm";

export class AddActivity1749800000000 implements MigrationInterface {
  name = "AddActivity1749800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity" (
        "id" SERIAL NOT NULL,
        "type" character varying(40) NOT NULL,
        "actor_user_id" integer,
        "ref_type" character varying(40),
        "ref_id" character varying(80),
        "title" character varying(200) NOT NULL,
        "link" character varying(200),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_type" ON "activity" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_createdAt" ON "activity" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_activity_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_activity_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity"`);
  }
}
