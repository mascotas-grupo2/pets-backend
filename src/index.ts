import "dotenv/config";
import http from "http";
import { AppDataSource } from "./data-source.js";
import { app } from "./app.js";
import { bootstrapAdmins } from "./lib/bootstrap-admins.js";
import { initRealtime } from "./lib/realtime.js";

const port = Number(process.env.PORT) || 3001;

AppDataSource.initialize()
  .then(async () => {
    await AppDataSource.runMigrations();
    await bootstrapAdmins();
    // Server HTTP propio para colgar Socket.IO (push de notificaciones).
    const server = http.createServer(app);
    initRealtime(server);
    server.listen(port, () => {
      console.log(`Servidor corriendo en http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("No se pudo conectar a la base de datos:", err);
    process.exit(1);
  });
