import "dotenv/config";
import { AppDataSource } from "./data-source.js";
import { Pet, AnimalType, PetSex } from "./entity/Pet.js";

async function seed() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const repo = AppDataSource.getRepository(Pet);
  await repo.clear();

  const data = [
    {
      name: "",
      animalType: AnimalType.PERRO,
      photo: "https://placehold.co/600x400?text=perro",
      description: "Perro marrón, amigable, llevaba collar azul cuando fue visto",
      date: "2026-04-22",
      location: "Vergara 2396, Villa Tesei",
      contactPhone: "1134567890",
      contactEmail: "contacto1@example.com",
      sex: PetSex.MACHO,
      breed: "Mezcla",
      ageMonths: 24,
      color: "Marron",
      weightKg: 18,
      heightCm: 45,
      hasCollar: true,
      vaccinated: true,
      friendlyWithKids: true,
    },
    {
      name: "",
      animalType: AnimalType.GATO,
      photo: "https://placehold.co/600x400?text=gato",
      description: "Es un gato naranja, se lo veía tranquilito, podemos tenerlo hasta nuevo aviso",
      date: "2026-04-22",
      location: "Adolfo Alsina 2256, Florida, Buenos Aires",
      contactPhone: "1198765432",
      contactEmail: "contacto2@example.com",
      sex: PetSex.HEMBRA,
      breed: "Naranja",
      ageMonths: 12,
      color: "Naranja",
      weightKg: 4.2,
    },
  ];

  for (const item of data) {
    await repo.save(repo.create(item));
  }

  console.log(`Seed completed: ${data.length} pets inserted.`);
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});