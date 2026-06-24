import { Router } from "express";
import {
  adminDeleteUser,
  adminListUsers,
  adminUpdateUserRole,
  getCommonInfo,
  getMe,
  getUserDetails,
  listContactableAdmins,
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
userRouter.get("/admins", requireAuth, listContactableAdmins);
userRouter.put("/update", requireAuth, updateUser);
userRouter.patch("/update", requireAuth, updateUser);
userRouter.post("/photo", requireAuth, single("photo"), multerErrorHandler, uploadProfilePhoto);

// Admin: gestión de usuarios y roles
userRouter.get("/admin/list", requireAdmin, adminListUsers);
userRouter.patch("/admin/:id/role", requireAdmin, adminUpdateUserRole);
userRouter.delete("/admin/:id", requireAdmin, adminDeleteUser);

userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", requireAuth, getUserDetails);
