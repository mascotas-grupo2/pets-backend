import { Router } from "express";
import { getCommonInfo, getMe, getUserDetails, updateUser } from "../controllers/user.controller.js";
import { requireAuth } from "../lib/auth.js";

export const userRouter = Router();

userRouter.get("/commonInfo/:id", getCommonInfo);
userRouter.get("/me", requireAuth, getMe);
userRouter.get("/detailsUser", requireAuth, getUserDetails);
userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", requireAuth, getUserDetails);
userRouter.patch("/:id", requireAuth, updateUser);
