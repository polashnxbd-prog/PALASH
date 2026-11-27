import type { NextFunction, Request, Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

const ADMIN_EMAIL = 'polashnxbd@gmail.com';

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string' && req.query.token.length > 0) {
    // Allow signed short-lived bearer token query param strictly for HTML5 <audio src> streaming
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || '';
    const emailVerified = Boolean(decoded.email_verified);
    req.user = {
      uid: decoded.uid,
      email,
      emailVerified,
      isAdmin: emailVerified && email.toLowerCase() === ADMIN_EMAIL,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Administrator privileges required.' });
  }
  return next();
}
