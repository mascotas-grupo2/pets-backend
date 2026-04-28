import { MigrationInterface, QueryRunner } from "typeorm";

export class InitPetTable1744402212000 implements MigrationInterface {
  name = "InitPetTable1744402212000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(
      `CREATE TYPE "public"."pet_animaltype_enum" AS ENUM('perro', 'gato', 'otro')`
    );

    await queryRunner.query(
      `CREATE TYPE "public"."pet_sex_enum" AS ENUM('macho', 'hembra')`
    );

    await queryRunner.query(
      `CREATE TABLE "pet" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(120),
        "photo" text,
        "photos" text array,
        "description" text NOT NULL,
        "animalType" "public"."pet_animaltype_enum" NOT NULL,
        "date" character varying(200) NOT NULL,
        "location" character varying(200) NOT NULL,
        "contactPhone" character varying(30) NOT NULL,
        "contactEmail" character varying(120) NOT NULL,
        "sex" "public"."pet_sex_enum",
        "breed" character varying(120),
        "ageMonths" integer,
        "color" character varying(80),
        "weightKg" double precision,
        "heightCm" double precision,
        "hasCollar" boolean,
        "hasTag" boolean,
        "microchipped" boolean,
        "neutered" boolean,
        "vaccinated" boolean,
        "friendlyWithKids" boolean,
        "trained" boolean,
        "reward" character varying(120),
        "userId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pet_id" PRIMARY KEY ("id")
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pet"`);
    await queryRunner.query(`DROP TYPE "public"."pet_sex_enum"`);
    await queryRunner.query(`DROP TYPE "public"."pet_animaltype_enum"`);
  }
}
