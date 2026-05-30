import "dotenv/config";
import { createServer } from "node:http";
import { AppDataSource } from "./data-source.js";
import { app } from "./app.js";
import { bootstrapAdmins } from "./lib/bootstrap-admins.js";
import { createChatGateway } from "./chat/chat.gateway.js";

const port = Number(process.env.PORT) || 3001;

AppDataSource.initialize()
  .then(async () => {
    await AppDataSource.runMigrations();
    await bootstrapAdmins();

    // Server HTTP explícito para compartirlo entre Express y el WebSocket.
    const server = createServer(app);
    createChatGateway(server);

    server.listen(port, () => {
      console.log(`Servidor corriendo en http://localhost:${port}`);
      console.log(`WebSocket de chat en ws://localhost:${port}/ws/chat`);
    });
  })
  .catch((err) => {
    console.error("No se pudo conectar a la base de datos:", err);
    process.exit(1);
  });
