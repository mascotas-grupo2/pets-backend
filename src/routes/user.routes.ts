import { Router } from "express";
import {
  adminListUsers,
  adminUpdateUserRole,
  getCommonInfo,
  getMe,
  getUserDetails,
  updateUser,
  uploadProfilePhoto,
} from "../controllers/user.controller.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { single, multerErrorHandler } from "../middleware/upload.js";

export const userRouter = Router();

userRouter.get("/commonInfo/:id", getCommonInfo);
userRouter.get("/commonInfo", requireAuth, getMe);
userRouter.get("/me", requireAuth, getMe);
userRouter.get("/detailsUser", requireAuth, getUserDetails);
userRouter.put("/update", requireAuth, updateUser);
userRouter.patch("/update", requireAuth, updateUser);
userRouter.post("/photo", requireAuth, single("photo"), multerErrorHandler, uploadProfilePhoto);

// Admin: gestión de usuarios y roles
userRouter.get("/admin/list", requireAdmin, adminListUsers);
userRouter.patch("/admin/:id/role", requireAdmin, adminUpdateUserRole);

userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", requireAuth, getUserDetails);
