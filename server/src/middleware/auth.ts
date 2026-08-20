import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { getUserAccess } from "../permissions";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Authentification requise." });
  }

  try {
    const { id } = verifyToken(token);
    const user = await getUserAccess(id);
    if (!user) {
      return res.status(401).json({ error: "Session invalide ou expirée." });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}
