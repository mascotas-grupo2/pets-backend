import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionEvaluation1749200000000
  implements MigrationInterface
{
  name = "AddAdoptionEvaluation1749200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "adoption_check" (
        "id" SERIAL PRIMARY KEY,
        "adoption_id" integer NOT NULL,
        "item" varchar(120) NOT NULL,
        "checked_by" integer,
        "checked_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_adoption_check_item" UNIQUE ("adoption_id", "item")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_adoption_check_adoption" ON "adoption_check" ("adoption_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "adoption_note" (
        "id" SERIAL PRIMARY KEY,
        "adoption_id" integer NOT NULL,
        "text" text NOT NULL,
        "author_id" integer,
        "author_name" varchar(120),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_adoption_note_adoption" ON "adoption_note" ("adoption_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "adoption_note"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "adoption_check"`);
  }
}
