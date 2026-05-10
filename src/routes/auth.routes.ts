import { Router } from "express";
import { googleSso, login, logout, refreshToken, register, verifyEmail } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh-token", refreshToken);
authRouter.post("/refresh", refreshToken);
authRouter.post("/logout", logout);
authRouter.post("/verify-email", verifyEmail);
authRouter.get("/verify-email", verifyEmail);
authRouter.post("/sso/google", googleSso);
