import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { ltiService, LtiError } from '../services/lti.service.js';
import { firebaseAdminService } from '../services/firebase-admin.service.js';
import { unifiedDb } from '../services/unified-database.service.js';
import { authLogger } from '../services/logger.service.js';

function getLaunchUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}/api/lti/launch`;
}

// The launch is a full-page navigation from the LMS: results go to the SPA in the URL fragment
function redirectToApp(res: Response, params: Record<string, string>) {
  res.redirect(303, `/lti/launch#${new URLSearchParams(params).toString()}`);
}

export function registerLtiRoutes(app: Express) {
  app.get('/api/lti/jwks', (req: Request, res: Response) => {
    try {
      res.status(200).json(ltiService.getPublicJwks());
    } catch (error: any) {
      authLogger.error('LTI JWKS unavailable', { error: error.message });
      res.status(503).json({ error: 'LTI is not configured', code: 'LTI_NOT_CONFIGURED' });
    }
  });

  // OIDC login initiation: the LMS may call it with GET or POST
  app.all('/api/lti/login', (req: Request, res: Response) => {
    try {
      const params = { ...req.query, ...req.body };
      res.redirect(302, ltiService.buildLoginRedirect(params, getLaunchUrl(req)));
    } catch (error: any) {
      authLogger.warn('LTI login rejected', { error: error.message });
      const status = error instanceof LtiError && error.code === 'not_configured' ? 503 : 400;
      res.status(status).json({ error: error.message, code: 'LTI_LOGIN_FAILED' });
    }
  });

  app.post('/api/lti/launch', async (req: Request, res: Response) => {
    try {
      if (req.body?.error) {
        throw new LtiError('platform_error', `Platform returned ${req.body.error}`);
      }

      const launch = await ltiService.validateLaunch(req.body?.id_token, req.body?.state);

      if (!(await unifiedDb.consumeLtiNonce(launch.nonce))) {
        throw new LtiError('replay', 'LTI launch already used');
      }
      if (!launch.email) {
        throw new LtiError('email_missing', 'LTI launch has no email claim');
      }

      // Teacher/admin accounts are accepted: the LMS accounts are created by the school admin
      // with verified emails. Student routes reject teachers, so they go to their dashboard.
      const dbUser = await unifiedDb.getUserByEmail(launch.email);
      const role = dbUser ? await unifiedDb.getUserRole(dbUser.id) : 'student';

      const firebaseUser = await firebaseAdminService.getUserByEmail(launch.email)
        || await firebaseAdminService.createUser(launch.email, crypto.randomBytes(32).toString('base64url'));
      const token = await firebaseAdminService.createCustomToken(firebaseUser.uid);

      authLogger.info('LTI launch accepted', { email: launch.email, role, ltiRoles: launch.roles, scenarioId: launch.scenarioId });
      redirectToApp(res, {
        token,
        ...(role === 'teacher' || role === 'admin' ? { role } : {}),
        ...(launch.scenarioId !== null ? { scenario: String(launch.scenarioId) } : {})
      });
    } catch (error: any) {
      authLogger.warn('LTI launch rejected', { error: error.message });
      redirectToApp(res, { error: error instanceof LtiError ? error.code : 'server_error' });
    }
  });
}
