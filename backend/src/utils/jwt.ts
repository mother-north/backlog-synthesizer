import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface TokenPayload {
  id: number;
  email: string;
  roles: string[];
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  } as SignOptions);
}

export function generateRefreshToken(payload: TokenPayload, rememberMe: boolean = false): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: rememberMe ? config.jwt.refreshExpiryRemember : config.jwt.refreshExpiry,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
}
