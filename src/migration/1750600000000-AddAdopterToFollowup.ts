import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Un seguimiento distingue ahora entre el RESPONSABLE (admin/staff que lo lleva
 * adelante, `user_id`) y el ADOPTANTE / persona interesada (`adopter_user_id`,
 * nullable: solo los seguimientos post-adopción tienen adoptante asociado).
 */
export class AddAdopterToFollowup1750600000000 implements MigrationInterface {
  name = "AddAdopterToFollowup1750600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seguimientos" ADD COLUMN IF NOT EXISTS "adopter_user_id" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seguimientos" DROP COLUMN IF EXISTS "adopter_user_id"`,
    );
  }
}
