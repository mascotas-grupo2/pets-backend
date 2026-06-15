import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDevueltaAlDuenoStatus1750000000000 implements MigrationInterface {
  name = "AddDevueltaAlDuenoStatus1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO catalog_value (id, catalog, code, label)
      VALUES (207, 'pet_status', 'devuelta al dueño', 'Devuelta al dueño')
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM catalog_value WHERE id = 207`);
  }
}
