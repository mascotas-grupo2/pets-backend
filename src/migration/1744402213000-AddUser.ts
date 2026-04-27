import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUser1744402213000 implements MigrationInterface {
  name = "AddUser1744402213000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
          CREATE TYPE "public"."user_role_enum" AS ENUM('user', 'admin');
        END IF;
      END
      $$`
    );

    await queryRunner.query(
      `CREATE TABLE "user" (
        "id"            SERIAL NOT NULL,
        "name"          character varying(120) NOT NULL,
        "email"         character varying(200) NOT NULL,
        "password_hash" character varying NOT NULL,
        "password_salt" character varying NOT NULL,
        "role"          "public"."user_role_enum" NOT NULL DEFAULT 'user',
        "adopter"       boolean NOT NULL DEFAULT false,
        "photo"         character varying(500),
        "firstName"     character varying(120),
        "lastName"      character varying(120),
        "phone"         character varying(30),
        "addressLine1"  character varying(200),
        "addressLine2"  character varying(200),
        "postcode"      character varying(20),
        "town"          character varying(120),
        "hasGarden"     boolean,
        "livingSituation" character varying(40),
        "householdSetting" character varying(40),
        "activityLevel" character varying(40),
        "adults"        integer,
        "children"      integer,
        "visitingChildren" boolean,
        "hasFlatmates"  boolean,
        "allergies"     text,
        "otherAnimals"  boolean,
        "otherAnimalsDetail" text,
        "neutered"      boolean,
        "vaccinated"    boolean,
        "experience"    text,
        "preferredAnimal" character varying(20),
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_email" UNIQUE ("email")
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_role_enum"`);
  }
}
