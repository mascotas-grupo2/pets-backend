import { vi } from "vitest";

// Los tests unitarios no necesitan Socket.IO; lo stubbeamos para que la cadena
// controller -> notify -> realtime -> socket.io no intente cargar el paquete.
vi.mock("socket.io", () => ({ Server: vi.fn() }));

process.env.JWT_SECRET ??= "test-secret-pets-backend-must-be-long-enough-32";
process.env.JWT_ISSUER ??= "pets-backend";
process.env.JWT_EXPIRES_IN ??= "1h";
