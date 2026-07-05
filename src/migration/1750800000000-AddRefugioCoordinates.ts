import { MigrationInterface, QueryRunner } from "typeorm";

// Agrega coordenadas al refugio para poder ubicar en el mapa todas sus mascotas
// gestionadas en un único punto (la sede del refugio), en vez de dispersarlas
// por las coordenadas propias de cada mascota.
export class AddRefugioCoordinates1750800000000 implements MigrationInterface {
  name = "AddRefugioCoordinates1750800000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "refugio" ADD COLUMN IF NOT EXISTS "latitud" double precision`,
    );
    await q.query(
      `ALTER TABLE "refugio" ADD COLUMN IF NOT EXISTS "longitud" double precision`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "refugio" DROP COLUMN IF EXISTS "longitud"`);
    await q.query(`ALTER TABLE "refugio" DROP COLUMN IF EXISTS "latitud"`);
  }
}
