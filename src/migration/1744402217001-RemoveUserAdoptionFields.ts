import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUserAdoptionFields1744402217001 implements MigrationInterface {
  name = "RemoveUserAdoptionFields1744402217001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user"
        DROP COLUMN IF EXISTS "preferredAnimal",
        DROP COLUMN IF EXISTS "firstName",
        DROP COLUMN IF EXISTS "lastName",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "addressLine1",
        DROP COLUMN IF EXISTS "addressLine2",
        DROP COLUMN IF EXISTS "postcode",
        DROP COLUMN IF EXISTS "town",
        DROP COLUMN IF EXISTS "hasGarden",
        DROP COLUMN IF EXISTS "livingSituation",
        DROP COLUMN IF EXISTS "householdSetting",
        DROP COLUMN IF EXISTS "activityLevel",
        DROP COLUMN IF EXISTS "adults",
        DROP COLUMN IF EXISTS "children",
        DROP COLUMN IF EXISTS "visitingChildren",
        DROP COLUMN IF EXISTS "hasFlatmates",
        DROP COLUMN IF EXISTS "allergies",
        DROP COLUMN IF EXISTS "otherAnimals",
        DROP COLUMN IF EXISTS "otherAnimalsDetail",
        DROP COLUMN IF EXISTS "neutered",
        DROP COLUMN IF EXISTS "vaccinated",
        DROP COLUMN IF EXISTS "experience";
      `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS "preferredAnimal" character varying(20),
        ADD COLUMN IF NOT EXISTS "firstName" character varying(120),
        ADD COLUMN IF NOT EXISTS "lastName" character varying(120),
        ADD COLUMN IF NOT EXISTS "phone" character varying(30),
        ADD COLUMN IF NOT EXISTS "addressLine1" character varying(200),
        ADD COLUMN IF NOT EXISTS "addressLine2" character varying(200),
        ADD COLUMN IF NOT EXISTS "postcode" character varying(20),
        ADD COLUMN IF NOT EXISTS "town" character varying(120),
        ADD COLUMN IF NOT EXISTS "hasGarden" boolean,
        ADD COLUMN IF NOT EXISTS "livingSituation" character varying(40),
        ADD COLUMN IF NOT EXISTS "householdSetting" character varying(40),
        ADD COLUMN IF NOT EXISTS "activityLevel" character varying(40),
        ADD COLUMN IF NOT EXISTS "adults" integer,
        ADD COLUMN IF NOT EXISTS "children" integer,
        ADD COLUMN IF NOT EXISTS "visitingChildren" boolean,
        ADD COLUMN IF NOT EXISTS "hasFlatmates" boolean,
        ADD COLUMN IF NOT EXISTS "allergies" text,
        ADD COLUMN IF NOT EXISTS "otherAnimals" boolean,
        ADD COLUMN IF NOT EXISTS "otherAnimalsDetail" text,
        ADD COLUMN IF NOT EXISTS "neutered" boolean,
        ADD COLUMN IF NOT EXISTS "vaccinated" boolean,
        ADD COLUMN IF NOT EXISTS "experience" text;
      `
    );
  }
}
