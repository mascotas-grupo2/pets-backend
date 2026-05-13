import { Router } from "express";
import { getCommonInfo, getMe, getUserDetails, updateUser } from "../controllers/user.controller.js";
import { requireAuth } from "../lib/auth.js";

export const userRouter = Router();

userRouter.get("/commonInfo/:id", getCommonInfo);
userRouter.get("/commonInfo", requireAuth, getMe);
userRouter.get("/me", requireAuth, getMe);
userRouter.get("/detailsUser", requireAuth, getUserDetails);
userRouter.put("/update", requireAuth, updateUser);
userRouter.patch("/update", requireAuth, updateUser);
userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", requireAuth, getUserDetails);
