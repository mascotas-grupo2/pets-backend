import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPetStatusAndNotes1744402217000 implements MigrationInterface {
  name = "AddPetStatusAndNotes1744402217000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."pet_status_enum" AS ENUM(
        'perdido',
        'encontrado',
        'en tránsito',
        'en tratamiento médico',
        'en adopción',
        'adoptado'
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN "status" "public"."pet_status_enum" NOT NULL DEFAULT 'perdido'`,
    );

    await queryRunner.query(`
      CREATE TABLE "pet_note" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "petId" uuid NOT NULL,
        "authorId" integer,
        "authorName" varchar(120),
        "text" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pet_note_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pet_note_petId" ON "pet_note" ("petId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_note_petId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_note"`);
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."pet_status_enum"`);
  }
}
