import jwt from "jsonwebtoken";

export interface TokenPayload {
  id: number;
  role: "admin" | "user";
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET doit être défini dans .env");
  }
  return secret;
}

const JWT_SECRET: string = getSecret();

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
