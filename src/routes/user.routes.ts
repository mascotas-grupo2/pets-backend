import { Router } from "express";
import { getCommonInfo, getUserDetails, updateUser } from "../controllers/user.controller.js";
import { requireAuth } from "../lib/auth.js";

export const userRouter = Router();

userRouter.get("/commonInfo/:id", getCommonInfo);
userRouter.get("/detailsUser", requireAuth, getUserDetails);
userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", requireAuth, getUserDetails);
userRouter.patch("/:id", requireAuth, updateUser);
