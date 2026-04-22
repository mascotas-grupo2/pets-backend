import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUser1744402213000 implements MigrationInterface {
  name = "AddUser1744402213000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user" (
        "id"            SERIAL NOT NULL,
        "name"          character varying(120) NOT NULL,
        "email"         character varying(200) NOT NULL,
        "password_hash" character varying NOT NULL,
        "password_salt" character varying NOT NULL,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_email" UNIQUE ("email")
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user"`);
  }
}
