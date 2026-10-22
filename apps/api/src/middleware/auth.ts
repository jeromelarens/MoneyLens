import { Request, Response, NextFunction } from 'express';
import { OrganizationModel } from '../infrastructure/database/models/index.js';
import { AppError } from './error-handler.js';
import { ERROR_CODES } from '@moneylens/shared';
import crypto from 'node:crypto';

export interface AuthenticatedOrganization {
  id: string;
  name: string;
  currency: string;
}

declare global {
  namespace Express {
    interface Request {
      organization?: AuthenticatedOrganization;
    }
  }
}

export const DEV_DEFAULT_API_KEY = 'ml_dev_org_test_key_phase2';
export const DEV_DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Computes a secure SHA-256 hash of an API key for safe storage and constant lookup.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

/**
 * Ensures a development organization exists for local testing/development.
 * STRICTLY FORBIDDEN IN PRODUCTION.
 */
export async function getOrCreateDevOrganization(): Promise<AuthenticatedOrganization> {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Development organization provisioning is disabled in production mode.',
    );
  }

  const devKeyHash = hashApiKey(DEV_DEFAULT_API_KEY);
  let org = await OrganizationModel.findOne({
    $or: [{ apiKeyHash: devKeyHash }, { apiKey: DEV_DEFAULT_API_KEY }],
  });

  if (!org) {
    org = await OrganizationModel.create({
      _id: DEV_DEFAULT_ORG_ID,
      name: 'MoneyLens Demo Enterprise',
      currency: 'USD',
      apiKey: DEV_DEFAULT_API_KEY,
      apiKeyHash: devKeyHash,
    });
  }

  return {
    id: org._id,
    name: org.name,
    currency: org.currency,
  };
}

/**
 * Authentication and Organization Authorization Middleware.
 * Strictly verifies identity before granting access to financial records.
 * Client-provided organization IDs are NEVER trusted from body or query.
 */
export async function requireOrganizationAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.header('Authorization');
    const apiKeyHeader = req.header('x-api-key');

    let token: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (apiKeyHeader) {
      token = apiKeyHeader.trim();
    }

    if (!token) {
      return next(
        new AppError(
          401,
          ERROR_CODES.AUTHENTICATION_REQUIRED,
          'Authentication is required to access organization financial data. Provide a valid Bearer token or x-api-key header.',
        ),
      );
    }

    // Security Hardening: Never allow the development key in production environment
    if (process.env.NODE_ENV === 'production' && token === DEV_DEFAULT_API_KEY) {
      return next(
        new AppError(
          401,
          ERROR_CODES.AUTHENTICATION_REQUIRED,
          'Development credentials cannot be used in a production environment.',
        ),
      );
    }

    // Check if token matches existing organization (supports both hashed and legacy keys)
    const tokenHash = hashApiKey(token);
    let org = await OrganizationModel.findOne({
      $or: [{ apiKeyHash: tokenHash }, { apiKey: token }],
    });

    // In development / test environment only, initialize demo org on valid dev key
    if (!org && token === DEV_DEFAULT_API_KEY && process.env.NODE_ENV !== 'production') {
      org = (await getOrCreateDevOrganization()) as unknown as typeof org;
    }

    if (!org) {
      return next(
        new AppError(
          401,
          ERROR_CODES.AUTHENTICATION_REQUIRED,
          'Invalid or revoked organization credentials.',
        ),
      );
    }

    req.organization = {
      id: org._id || (org as unknown as AuthenticatedOrganization).id,
      name: org.name,
      currency: org.currency,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to create a new organization with a unique hashed API key.
 */
export async function createOrganizationForTesting(
  name: string,
  currency = 'USD',
): Promise<{ organization: AuthenticatedOrganization; apiKey: string }> {
  const apiKey = `ml_test_key_${crypto.randomUUID()}`;
  const apiKeyHash = hashApiKey(apiKey);
  const org = await OrganizationModel.create({
    name,
    currency,
    apiKey,
    apiKeyHash,
  });

  return {
    organization: {
      id: org._id,
      name: org.name,
      currency: org.currency,
    },
    apiKey,
  };
}
