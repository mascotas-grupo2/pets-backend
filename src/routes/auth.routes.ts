import { Router } from "express";
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  googleSso,
  login,
  logout,
  refreshToken,
  register,
  resendVerification,
  resetPassword,
  ssoSync,
  verifyEmail,
  wsToken,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../lib/auth.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh-token", refreshToken);
authRouter.post("/refresh", refreshToken);
authRouter.post("/logout", logout);
authRouter.post("/verify-email", verifyEmail);
authRouter.get("/verify-email", verifyEmail);
authRouter.post("/resend-verification", resendVerification);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.get("/ws-token", requireAuth, wsToken);
authRouter.post("/change-password", requireAuth, changePassword);
authRouter.delete("/account", requireAuth, deleteAccount);
authRouter.post("/sso-sync", ssoSync);
authRouter.post("/sso/google", googleSso);
