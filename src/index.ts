import "dotenv/config";
import http from "http";
import { AppDataSource } from "./data-source.js";
import { app } from "./app.js";
import { bootstrapAdmins } from "./lib/bootstrap-admins.js";
import { initRealtime } from "./lib/realtime.js";
import { notifyExpiredPublications } from "./controllers/mascotas.controller.js";

const port = Number(process.env.PORT) || 3001;

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

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
    // Barrido de vencimientos: avisa a los dueños de publicaciones vencidas.
    // Al arrancar (con margen) y luego cada 24 h.
    setTimeout(() => void notifyExpiredPublications(), 30_000);
    setInterval(() => void notifyExpiredPublications(), 24 * 60 * 60 * 1000);
  })
  .catch((err) => {
    console.error("No se pudo conectar a la base de datos:", err);
    process.exit(1);
  });
