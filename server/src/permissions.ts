import { Request, Response, NextFunction } from "express";
import { pool } from "./db/pool";

export const SECTIONS = [
  "data-types",
  "sites",
  "equipment",
  "variables",
  "apis",
  "plans",
  "reporting",
  "configurations",
  "system",
  "rights",
] as const;

export type Section = (typeof SECTIONS)[number];
export type AccessLevel = "read" | "write";

// Lets an aggregator/picker page read supporting data it doesn't "own" (e.g. Plans needs to GET
// equipment/ports/apis to render its canvas) without granting write on the section it borrows
// from. Only consulted for GET/HEAD; writes always require the router's own owning section.
export const READ_CASCADE: Record<Section, Section[]> = {
  "data-types": ["equipment", "plans"],
  sites: ["equipment"],
  equipment: ["plans", "reporting"],
  variables: ["reporting"],
  apis: ["equipment", "plans", "reporting"],
  plans: [],
  reporting: [],
  // Reporting displays switch/moxa config summaries, so it needs to read switch-configs/
  // mgate-configs without requiring its own "configurations" permission.
  configurations: ["reporting"],
  system: [],
  rights: [],
};

export interface UserRole {
  id: number;
  name: string;
  isAdmin: boolean;
}

export interface UserAccess {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  permissions: Partial<Record<Section, AccessLevel>>;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserAccess;
    }
  }
}

// Single source of truth for "who is this user and what can they access" — used by requireAuth,
// and reused as-is for /auth/login, /auth/register, and /auth/me response bodies so all three
// share one shape and one query.
export async function getUserAccess(id: number): Promise<UserAccess | null> {
  const result = await pool.query(
    `SELECT u.id, u.username, u.first_name AS "firstName", u.last_name AS "lastName",
            u.email, u.phone,
            r.id AS "roleId", r.name AS "roleName", r.is_admin AS "roleIsAdmin",
            COALESCE(
              json_object_agg(rp.section, rp.access_level) FILTER (WHERE rp.section IS NOT NULL),
              '{}'
            ) AS permissions
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE u.id = $1
     GROUP BY u.id, r.id, r.name, r.is_admin`,
    [id]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    role: { id: row.roleId, name: row.roleName, isAdmin: row.roleIsAdmin },
    permissions: row.permissions,
  };
}

function hasLevel(level: AccessLevel | undefined, needed: AccessLevel): boolean {
  if (needed === "read") {
    return level === "read" || level === "write";
  }
  return level === "write";
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.role.isAdmin) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  next();
}

export function requirePermission(section: Section) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise." });
    }
    if (user.role.isAdmin) {
      return next();
    }

    const needed: AccessLevel = req.method === "GET" || req.method === "HEAD" ? "read" : "write";
    if (hasLevel(user.permissions[section], needed)) {
      return next();
    }

    if (needed === "read") {
      const cascadesFrom = READ_CASCADE[section];
      if (cascadesFrom.some((consumer) => hasLevel(user.permissions[consumer], "read"))) {
        return next();
      }
    }

    return res.status(403).json({ error: "Accès refusé." });
  };
}
