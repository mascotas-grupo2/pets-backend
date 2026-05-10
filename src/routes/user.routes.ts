import { Router } from "express";
import { getCommonInfo, getUserDetails, updateUser } from "../controllers/user.controller.js";

export const userRouter = Router();

userRouter.get("/commonInfo/:id", getCommonInfo);
userRouter.get("/detailsUser", getUserDetails);
userRouter.get("/:id", getCommonInfo);
userRouter.get("/:id/details", getUserDetails);
userRouter.patch("/:id", updateUser);
