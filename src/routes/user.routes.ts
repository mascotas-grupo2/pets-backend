import { Router } from "express";
import { getCommonInfo, getMe, getUserDetails, updateUser, uploadProfilePhoto } from "../controllers/user.controller.js";
import { requireAuth } from "../lib/auth.js";
import { single, multerErrorHandler } from "../middleware/upload.js";

export const userRouter = Router();

userRouter.get("/commonInfo/:id", getCommonInfo);
userRouter.get("/commonInfo", requireAuth, getMe);
userRouter.get("/me", requireAuth, getMe);
userRouter.get("/detailsUser", requireAuth, getUserDetails);
userRouter.put("/update", requireAuth, updateUser);
userRouter.patch("/update", requireAuth, updateUser);
userRouter.post("/photo", requireAuth, single("photo"), multerErrorHandler, uploadProfilePhoto);
userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", requireAuth, getUserDetails);
