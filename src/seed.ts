import "dotenv/config";
import { AppDataSource } from "./data-source.js";
import { Mascota, Especie, Estado } from "./entity/Mascota.js";
import { geocodificarDireccion } from "./lib/geocoding.js";

async function seed() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const repo = AppDataSource.getRepository(Mascota);
  await repo.clear();

  const data = [
    {
      especie: Especie.PERRO,
      estado: Estado.AVISTADO,
      raza: "Calle y vereda",
      descripcion: "Perro marrón, amigable, llevaba collar azul cuando fue visto",
      direccion: "Vergara 2396, Villa Tesei",
    },
    {
      especie: Especie.GATO,
      estado: Estado.TRANSITO,
      raza: "Naranja",
      descripcion: "Es un gato naranja, se lo veía tranquilito, podemos tenerlo hasta nuevo aviso",
      direccion: "Adolfo Alsina 2256, Florida, Buenos Aires",
    },
  ];

  for (const item of data) {
    const coords = await geocodificarDireccion(item.direccion);
    await repo.save(repo.create({ ...item, ...coords }));
  }

  console.log(`Seed completado: ${data.length} mascotas insertadas.`);
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Error en el seed:", err);
  process.exit(1);
});
