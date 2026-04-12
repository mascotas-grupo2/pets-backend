import "dotenv/config";
import { AppDataSource } from "./data-source.js";
import { app } from "./app.js";

const port = Number(process.env.PORT) || 3001;

AppDataSource.initialize()
  .then(async () => {
    await AppDataSource.runMigrations();
    app.listen(port, () => {
      console.log(`Servidor corriendo en http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("No se pudo conectar a la base de datos:", err);
    process.exit(1);
  });
