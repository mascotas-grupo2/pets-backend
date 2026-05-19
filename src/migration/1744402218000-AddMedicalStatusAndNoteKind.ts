import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMedicalStatusAndNoteKind1744402218000
  implements MigrationInterface
{
  name = "AddMedicalStatusAndNoteKind1744402218000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."pet_medical_status_enum" AS ENUM(
        'sano',
        'en evaluación',
        'en tratamiento',
        'post-operatorio',
        'recuperándose',
        'crítico'
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN "medicalStatus" "public"."pet_medical_status_enum" NOT NULL DEFAULT 'sano'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."pet_note_kind_enum" AS ENUM(
        'general',
        'medica',
        'adopcion'
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_note" ADD COLUMN "kind" "public"."pet_note_kind_enum" NOT NULL DEFAULT 'general'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet_note" DROP COLUMN "kind"`);
    await queryRunner.query(`DROP TYPE "public"."pet_note_kind_enum"`);
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN "medicalStatus"`);
    await queryRunner.query(`DROP TYPE "public"."pet_medical_status_enum"`);
  }
}
