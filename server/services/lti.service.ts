/**
 * LTI 1.3 Service (tool side)
 *
 * Handles the OIDC login initiation and the validation of launches coming from
 * the LMS (LearnWorlds). Single platform, configured by environment variables.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const LTI_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
const STATE_AUDIENCE = 'lti-state';
const JWKS_CACHE_MS = 10 * 60 * 1000;

interface LtiConfig {
  issuer: string;
  clientId: string;
  deploymentId: string;
  authUrl: string;
  jwksUrl: string;
  privateKey: crypto.KeyObject;
}

export interface LtiLaunch {
  sub: string;
  nonce: string;
  email: string | null;
  roles: string[];
  scenarioId: number | null;
}

export class LtiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

class LtiService {
  private config: LtiConfig | null = null;
  private jwksCache: { keys: any[]; fetchedAt: number } | null = null;

  private getConfig(): LtiConfig {
    if (this.config) return this.config;

    const env = {
      LTI_ISSUER: process.env.LTI_ISSUER,
      LTI_CLIENT_ID: process.env.LTI_CLIENT_ID,
      LTI_DEPLOYMENT_ID: process.env.LTI_DEPLOYMENT_ID,
      LTI_AUTH_URL: process.env.LTI_AUTH_URL,
      LTI_JWKS_URL: process.env.LTI_JWKS_URL
    };
    const missing = Object.entries(env).filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) {
      throw new LtiError('not_configured', `Missing LTI configuration: ${missing.join(', ')}`);
    }

    this.config = {
      issuer: env.LTI_ISSUER!,
      clientId: env.LTI_CLIENT_ID!,
      deploymentId: env.LTI_DEPLOYMENT_ID!,
      authUrl: env.LTI_AUTH_URL!,
      jwksUrl: env.LTI_JWKS_URL!,
      privateKey: this.getPrivateKey()
    };
    return this.config;
  }

  private getPrivateKey(): crypto.KeyObject {
    let pem = process.env.LTI_PRIVATE_KEY;
    if (!pem) {
      throw new LtiError('not_configured', 'Missing LTI configuration: LTI_PRIVATE_KEY');
    }
    // Same formatting rules as FIREBASE_PRIVATE_KEY on Vercel
    if (pem.startsWith('"') && pem.endsWith('"')) {
      pem = pem.substring(1, pem.length - 1);
    }
    return crypto.createPrivateKey(pem.replace(/\\n/g, '\n'));
  }

  /**
   * Public key set of the tool, to register as "JWKS URL" in the LMS
   */
  getPublicJwks(): { keys: any[] } {
    const publicKey = crypto.createPublicKey(this.getPrivateKey());
    const kid = crypto
      .createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('base64url')
      .substring(0, 16);

    return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] };
  }

  /**
   * Step 1 (OIDC login initiation): build the redirect to the LMS authorization endpoint
   */
  buildLoginRedirect(params: Record<string, any>, redirectUri: string): string {
    const config = this.getConfig();

    if (params.iss !== config.issuer) {
      throw new LtiError('unknown_platform', 'Unknown LTI issuer');
    }
    if (params.client_id && params.client_id !== config.clientId) {
      throw new LtiError('unknown_platform', 'Unknown LTI client_id');
    }
    if (!params.login_hint || typeof params.login_hint !== 'string') {
      throw new LtiError('invalid_request', 'Missing login_hint');
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const state = jwt.sign({ nonce }, config.privateKey, {
      algorithm: 'RS256',
      expiresIn: '10m',
      audience: STATE_AUDIENCE
    });

    const url = new URL(config.authUrl);
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('response_type', 'id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('prompt', 'none');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('login_hint', params.login_hint);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    if (typeof params.lti_message_hint === 'string') {
      url.searchParams.set('lti_message_hint', params.lti_message_hint);
    }
    return url.toString();
  }

  /**
   * Step 2 (launch): verify the id_token signed by the LMS and extract the user
   */
  async validateLaunch(idToken: unknown, state: unknown): Promise<LtiLaunch> {
    const config = this.getConfig();

    if (typeof idToken !== 'string' || typeof state !== 'string') {
      throw new LtiError('invalid_request', 'Missing id_token or state');
    }

    let expectedNonce: string;
    try {
      const statePayload = jwt.verify(state, crypto.createPublicKey(config.privateKey), {
        algorithms: ['RS256'],
        audience: STATE_AUDIENCE
      }) as jwt.JwtPayload;
      expectedNonce = statePayload.nonce;
    } catch {
      throw new LtiError('invalid_state', 'Invalid or expired state');
    }

    const kid = jwt.decode(idToken, { complete: true })?.header.kid;
    if (!kid) {
      throw new LtiError('invalid_token', 'id_token has no key id');
    }
    const platformKey = await this.getPlatformKey(kid);

    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(idToken, platformKey, {
        algorithms: ['RS256'],
        issuer: config.issuer,
        audience: config.clientId,
        clockTolerance: 5
      }) as jwt.JwtPayload;
    } catch (error: any) {
      throw new LtiError('invalid_token', `id_token rejected: ${error.message}`);
    }

    if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== config.clientId) {
      throw new LtiError('invalid_token', 'id_token azp mismatch');
    }
    if (!claims.nonce || claims.nonce !== expectedNonce) {
      throw new LtiError('invalid_token', 'Nonce mismatch');
    }
    if (claims[`${LTI_CLAIM}deployment_id`] !== config.deploymentId) {
      throw new LtiError('unknown_platform', 'Unknown LTI deployment');
    }
    if (claims[`${LTI_CLAIM}message_type`] !== 'LtiResourceLinkRequest') {
      throw new LtiError('invalid_request', 'Unsupported LTI message type');
    }
    if (!claims.sub) {
      throw new LtiError('invalid_token', 'id_token has no subject');
    }

    return {
      sub: claims.sub,
      nonce: claims.nonce,
      email: typeof claims.email === 'string' ? claims.email.toLowerCase().trim() : null,
      roles: Array.isArray(claims[`${LTI_CLAIM}roles`]) ? claims[`${LTI_CLAIM}roles`] : [],
      scenarioId: this.extractScenarioId(claims)
    };
  }

  /**
   * The scenario comes from the activity link (…/api/lti/launch?scenario=5) or a custom parameter
   */
  private extractScenarioId(claims: jwt.JwtPayload): number | null {
    let raw: unknown = claims[`${LTI_CLAIM}custom`]?.scenario;
    if (raw === undefined) {
      try {
        raw = new URL(claims[`${LTI_CLAIM}target_link_uri`]).searchParams.get('scenario');
      } catch {
        raw = null;
      }
    }
    return /^\d+$/.test(String(raw)) ? parseInt(String(raw), 10) : null;
  }

  private async getPlatformKey(kid: string): Promise<crypto.KeyObject> {
    const config = this.getConfig();
    const findKey = () => this.jwksCache?.keys.find(key => key.kid === kid);

    if (!findKey() || Date.now() - this.jwksCache!.fetchedAt > JWKS_CACHE_MS) {
      const response = await fetch(config.jwksUrl);
      if (!response.ok) {
        throw new LtiError('platform_unreachable', `Platform JWKS fetch failed (${response.status})`);
      }
      const jwks = await response.json();
      this.jwksCache = { keys: Array.isArray(jwks.keys) ? jwks.keys : [], fetchedAt: Date.now() };
    }

    const jwk = findKey();
    if (!jwk) {
      throw new LtiError('invalid_token', 'id_token signed with an unknown key');
    }
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }
}

export const ltiService = new LtiService();
