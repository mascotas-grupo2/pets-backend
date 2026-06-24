import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionKind1749600000000 implements MigrationInterface {
  name = "AddAdoptionKind1749600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // "kind" distingue una solicitud de adopción de un ofrecimiento de tránsito,
    // reusando la misma tabla/flujo. Default 'adopcion' para filas existentes.
    await queryRunner.query(
      `ALTER TABLE "adoption" ADD COLUMN IF NOT EXISTS "kind" character varying(20) NOT NULL DEFAULT 'adopcion'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN IF EXISTS "kind"`);
  }
}
