import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1744402212000 implements MigrationInterface {
  name = "Init1744402212000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."mascota_especie_enum" AS ENUM('PERRO', 'GATO', 'OTRO')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."mascota_estado_enum" AS ENUM('AVISTADO', 'TRANSITO', 'REFUGIO')`
    );
    await queryRunner.query(
      `CREATE TABLE "mascota" (
        "id"          SERIAL NOT NULL,
        "nombre"      character varying,
        "especie"     "public"."mascota_especie_enum" NOT NULL,
        "estado"      "public"."mascota_estado_enum" NOT NULL,
        "raza"        character varying,
        "edad"        integer,
        "descripcion" text,
        "direccion"   character varying,
        "latitud"     double precision,
        "longitud"    double precision,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mascota_id" PRIMARY KEY ("id")
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mascota"`);
    await queryRunner.query(`DROP TYPE "public"."mascota_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."mascota_especie_enum"`);
  }
}
