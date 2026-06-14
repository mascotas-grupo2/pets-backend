import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSighting1749900000000 implements MigrationInterface {
  name = "AddSighting1749900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sighting" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pet_id" uuid NOT NULL,
        "reporter_user_id" integer,
        "place" character varying(200),
        "sighted_on" character varying(40),
        "note" text,
        "contact" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sighting_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sighting_pet" ON "sighting" ("pet_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_sighting_pet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sighting"`);
  }
}
