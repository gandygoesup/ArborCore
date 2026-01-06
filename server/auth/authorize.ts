import type { RequestHandler, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";

export type AuthedUser = {
  id: string;
  companyId: string | null;
  roles: string[];
};

declare global {
  namespace Express {
    interface Request {
      authedUser?: AuthedUser;
    }
  }
}

function asUserId(req: any): string {
  return req.user?.claims?.sub;
}

function notFound(res: Response) {
  return res.status(404).json({ message: "Not found" });
}

const loadAuthedUser: RequestHandler = async (req: any, res, next) => {
  const userId = asUserId(req);
  const user = await storage.getUser(userId);

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const roles = await storage.getUserRoles(userId);

  req.authedUser = {
    id: userId,
    companyId: user.companyId ?? null,
    roles: roles.map((r: any) => r.name),
  };

  next();
};

export const requireAuth: RequestHandler[] = [
  isAuthenticated,
  loadAuthedUser,
];

export function requireCompany(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authedUser?.companyId) {
      return res.status(400).json({ message: "No company associated with user" });
    }
    next();
  };
}

export function requireRole(...allowed: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles = req.authedUser?.roles ?? [];
    const ok = roles.some((r) => allowed.includes(r));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

export function assertCompanyScoped(
  req: Request,
  res: Response,
  resourceCompanyId: string | null | undefined
): Response | null {
  const userCompanyId = req.authedUser?.companyId;
  if (!userCompanyId || !resourceCompanyId || userCompanyId !== resourceCompanyId) {
    return notFound(res);
  }
  return null;
}

export function requireCompanyAccessFromParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const userCompanyId = req.authedUser?.companyId;
    if (!userCompanyId) return res.status(400).json({ message: "No company associated with user" });
    if (req.params[paramName] !== userCompanyId) return notFound(res);
    next();
  };
}

export function getAuthedUser(req: Request): AuthedUser {
  if (!req.authedUser) {
    throw new Error("No authenticated user - requireAuth middleware not applied");
  }
  return req.authedUser;
}
