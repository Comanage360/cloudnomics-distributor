import { Router } from "express";
import { loadPricelist } from "../db.js";

export const pricelistRouter = Router();

pricelistRouter.get("/", async (_req, res) => {
  const pricelist = await loadPricelist();
  res.json(pricelist);
});
