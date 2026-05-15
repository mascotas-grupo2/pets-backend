import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoption1744402216000 implements MigrationInterface {
  name = "AddAdoption1744402216000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "adoption" (
        "id" SERIAL NOT NULL,
        "preferredAnimal" character varying(20),
        "firstName" character varying(120) NOT NULL,
        "lastName" character varying(120) NOT NULL,
        "email" character varying(200) NOT NULL,
        "phone" character varying(30) NOT NULL,
        "addressLine1" character varying(200) NOT NULL,
        "addressLine2" character varying(200),
        "postcode" character varying(20) NOT NULL,
        "town" character varying(120) NOT NULL,
        "hasGarden" character varying(4),
        "livingSituation" character varying(40),
        "householdSetting" character varying(40),
        "activityLevel" character varying(40),
        "adults" integer,
        "children" integer,
        "visitingChildren" character varying(4),
        "hasFlatmates" character varying(4),
        "allergies" text,
        "otherAnimals" character varying(4),
        "otherAnimalsDetail" text,
        "neutered" character varying(4),
        "vaccinated" character varying(4),
        "experience" text,
        "acceptsTerms" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_adoption_id" PRIMARY KEY ("id")
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "adoption"`);
  }
}
