/**
 * Firebase Authentication Middleware
 *
 * Verifies Firebase ID tokens and manages user authentication/authorization
 */

import { Request, Response, NextFunction } from 'express';
import { firebaseAdminService } from '../services/firebase-admin.service.js';
import { unifiedDb } from '../services/unified-database.service.js';
import { authService } from './auth.middleware.js';

export interface FirebaseAuthRequest extends Request {
  firebaseUser?: {
    uid: string;
    email: string;
    role?: 'admin' | 'teacher' | 'student';
    emailVerified: boolean;
  };
  jwtToken?: string;
}

/**
 * Middleware to verify Firebase ID token and load/create user in Supabase
 */
export const verifyFirebaseToken = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract Firebase ID token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No Firebase ID token provided',
        code: 'FIREBASE_TOKEN_MISSING'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify token with Firebase Admin
    const decodedToken = await firebaseAdminService.verifyIdToken(idToken);

    if (!decodedToken.email) {
      return res.status(400).json({
        error: 'Firebase user has no email',
        code: 'FIREBASE_EMAIL_MISSING'
      });
    }

    // Load or create user in Supabase
    const { user, role } = await getOrCreateSupabaseUser(
      decodedToken.uid,
      decodedToken.email
    );

    // Attach Firebase user info to request
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: role as 'admin' | 'student',
      emailVerified: decodedToken.email_verified || false
    };

    // Generate internal JWT for backward compatibility
    const jwtToken = authService.generateToken(decodedToken.email);
    req.jwtToken = jwtToken;

    console.log('✅ Firebase user authenticated:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role
    });

    next();
  } catch (error: any) {
    console.error('❌ Firebase token verification failed:', error.message);

    return res.status(403).json({
      error: error.message || 'Firebase authentication failed',
      code: 'FIREBASE_AUTH_FAILED'
    });
  }
};

/**
 * Get or create user in Supabase from Firebase UID
 */
async function getOrCreateSupabaseUser(
  firebaseUid: string,
  email: string
): Promise<{ user: any; role: string }> {
  try {
    // Check if user exists by firebase_uid
    const existingUser = await unifiedDb.getUserByFirebaseUid(firebaseUid);

    if (existingUser) {
      const role = await unifiedDb.getUserRole(existingUser.id);
      console.log('✅ Found existing Supabase user:', {
        id: existingUser.id,
        email: existingUser.email,
        role
      });
      return { user: existingUser, role };
    }

    // Check if user exists by email (for migration cases)
    const userByEmail = await unifiedDb.getUserByEmail(email);

    if (userByEmail) {
      // Update existing user with firebase_uid
      await unifiedDb.updateUserFirebaseUid(userByEmail.id, firebaseUid);
      const role = await unifiedDb.getUserRole(userByEmail.id);
      console.log('✅ Linked existing Supabase user to Firebase:', {
        id: userByEmail.id,
        email: userByEmail.email,
        firebaseUid,
        role
      });
      return { user: userByEmail, role };
    }

    // Create new user in Supabase
    const newUser = await unifiedDb.createUser({
      email,
      firebaseUid,
      firstName: null,
      lastName: null,
      profileImageUrl: null
    });

    // Assign default role (student)
    await unifiedDb.setUserRole(newUser.id, 'student');

    console.log('✅ Created new Supabase user from Firebase:', {
      id: newUser.id,
      email: newUser.email,
      firebaseUid,
      role: 'student'
    });

    return { user: newUser, role: 'student' };
  } catch (error) {
    console.error('❌ Error getting/creating Supabase user:', error);
    throw new Error('Failed to sync user with database');
  }
}

/**
 * Middleware to require admin role
 */
export const requireFirebaseAdmin = (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.firebaseUser) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.firebaseUser.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin privileges required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

/**
 * Middleware to require student role (or admin)
 */
export const requireFirebaseStudent = (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.firebaseUser) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.firebaseUser.role !== 'student' && req.firebaseUser.role !== 'admin') {
    return res.status(403).json({
      error: 'Student access required',
      code: 'STUDENT_REQUIRED'
    });
  }

  next();
};

/**
 * Optional Firebase authentication (doesn't fail if no token)
 */
export const optionalFirebaseAuth = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without authentication
    return next();
  }

  try {
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await firebaseAdminService.verifyIdToken(idToken);

    if (decodedToken.email) {
      const { user, role } = await getOrCreateSupabaseUser(
        decodedToken.uid,
        decodedToken.email
      );

      req.firebaseUser = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: role as 'admin' | 'student',
        emailVerified: decodedToken.email_verified || false
      };

      const jwtToken = authService.generateToken(decodedToken.email);
      req.jwtToken = jwtToken;
    }
  } catch (error) {
    // Ignore authentication errors for optional auth
    console.log('⚠️ Optional Firebase auth failed, continuing without auth');
  }

  next();
};

/**
 * SECURE Teacher Authentication Middleware (Firebase Only)
 *
 * AUTHENTICATION METHOD:
 * - Firebase ID token (Authorization: Bearer <token>)
 *
 * SECURITY:
 * - Requires valid Firebase ID token in Authorization header
 * - Verifies user has admin/teacher role in database
 * - Email extracted from verified Firebase token (cannot be spoofed)
 *
 * Usage: Apply to ALL teacher dashboard routes
 */
export const requireTeacher = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('🔍 [DEBUG] requireTeacher middleware called:', {
      path: req.path,
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'MISSING',
        origin: req.headers.origin,
        referer: req.headers.referer
      },
      query: req.query,
      timestamp: new Date().toISOString()
    });

    // METHOD 1: Try Firebase authentication first (preferred)
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];

      try {
        console.log('🔍 [DEBUG] Attempting Firebase token verification...');
        // Verify Firebase token
        const decodedToken = await firebaseAdminService.verifyIdToken(idToken);
        console.log('✅ [DEBUG] Firebase token verified:', {
          uid: decodedToken.uid,
          email: decodedToken.email,
          email_verified: decodedToken.email_verified
        });

        if (!decodedToken.email) {
          return res.status(400).json({
            error: 'Firebase user has no email',
            code: 'EMAIL_MISSING'
          });
        }

        // Load user from database to verify role
        console.log('🔍 [DEBUG] Loading user from Supabase...');
        const { user, role } = await getOrCreateSupabaseUser(
          decodedToken.uid,
          decodedToken.email
        );
        console.log('✅ [DEBUG] User loaded from Supabase:', {
          userId: user?.id,
          email: user?.email,
          role: role,
          hasUser: !!user
        });

        // Verify user has admin/teacher role
        console.log('🔍 [DEBUG] Checking role authorization:', {
          currentRole: role,
          requiredRoles: ['admin', 'teacher'],
          isAuthorized: role === 'admin' || role === 'teacher'
        });

        if (role !== 'admin' && role !== 'teacher') {
          console.error('❌ [DEBUG] Authorization FAILED - Invalid role:', {
            email: decodedToken.email,
            role,
            uid: decodedToken.uid,
            route: req.path
          });

          return res.status(403).json({
            error: 'Teacher/Admin privileges required',
            code: 'TEACHER_REQUIRED',
            details: 'This route is only accessible to teachers and administrators'
          });
        }

        // Attach verified teacher info to request
        req.firebaseUser = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          role: role as 'admin' | 'teacher',
          emailVerified: decodedToken.email_verified || false
        };

        console.log('✅ Teacher authenticated (Firebase):', {
          email: decodedToken.email,
          role,
          route: req.path
        });

        return next();
      } catch (firebaseError: any) {
        console.error('❌ [DEBUG] Firebase authentication FAILED:', {
          error: firebaseError.message,
          code: firebaseError.code,
          stack: firebaseError.stack?.split('\n')[0],
          route: req.path
        });
        
        return res.status(401).json({
          error: 'Firebase authentication failed',
          code: 'FIREBASE_AUTH_FAILED',
          details: firebaseError.message
        });
      }
    }

    // No Firebase token provided
    console.error('❌ [DEBUG] No Firebase authentication token provided:', {
      hasAuthHeader: !!authHeader,
      route: req.path,
      method: req.method
    });

    return res.status(401).json({
      error: 'Firebase authentication required',
      code: 'AUTH_REQUIRED',
      details: 'Please provide Firebase ID token in Authorization header (Bearer <token>)'
    });

  } catch (error: any) {
    console.error('❌ Teacher authentication error:', error.message);

    // Specific error handling
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Authentication token expired',
        code: 'TOKEN_EXPIRED',
        details: 'Please re-authenticate to continue'
      });
    }

    return res.status(403).json({
      error: error.message || 'Authentication failed',
      code: 'AUTH_FAILED',
      details: 'Unable to verify teacher credentials'
    });
  }
};

/**
 * Middleware to require authenticated admin user (role='admin' in database)
 *
 * SECURITY: Uses role from database, NOT hardcoded emails
 *
 * Usage: Apply to admin-only routes (e.g., create/modify training sessions, assign teachers)
 */
export const requireAdmin = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Try Firebase authentication first
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required - missing Authorization header',
        code: 'AUTH_REQUIRED',
        details: 'Admin routes require Firebase ID token in Authorization: Bearer <token>'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify Firebase token
    const decodedToken = await firebaseAdminService.verifyIdToken(idToken);

    if (!decodedToken.email) {
      return res.status(400).json({
        error: 'Firebase user has no email',
        code: 'EMAIL_MISSING'
      });
    }

    // Load user from database to verify role
    const { user, role } = await getOrCreateSupabaseUser(
      decodedToken.uid,
      decodedToken.email
    );

    // Verify user has admin role
    if (role !== 'admin') {
      console.warn('⚠️ Non-admin user attempted to access admin route:', {
        email: decodedToken.email,
        role,
        uid: decodedToken.uid,
        route: req.path
      });

      return res.status(403).json({
        error: 'Admin privileges required',
        code: 'ADMIN_REQUIRED',
        details: 'This route is only accessible to administrators'
      });
    }

    // Attach verified admin info to request
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: 'admin',
      emailVerified: decodedToken.email_verified || false
    };

    console.log('✅ Admin authenticated:', {
      email: decodedToken.email,
      role,
      route: req.path
    });

    next();
  } catch (error: any) {
    console.error('❌ Admin authentication failed:', error.message);

    // Specific error handling
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Authentication token expired',
        code: 'TOKEN_EXPIRED',
        details: 'Please re-authenticate to continue'
      });
    }

    return res.status(403).json({
      error: error.message || 'Authentication failed',
      code: 'AUTH_FAILED',
      details: 'Unable to verify admin credentials'
    });
  }
};

/**
 * SECURE Student Authentication Middleware (Firebase Only)
 *
 * AUTHENTICATION METHOD:
 * - Firebase ID token (Authorization: Bearer <token>)
 *
 * SECURITY:
 * - Requires valid Firebase ID token in Authorization header
 * - Verifies user has student role in database
 * - Email extracted from verified Firebase token (cannot be spoofed)
 * - Students can only access their own data
 *
 * Usage: Apply to ALL student routes (sessions, evaluations, etc.)
 */
export const requireStudent = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('🔍 [DEBUG] requireStudent middleware called:', {
      path: req.path,
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'MISSING',
        origin: req.headers.origin,
        referer: req.headers.referer
      },
      timestamp: new Date().toISOString()
    });

    // Require Firebase authentication
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ [DEBUG] No Firebase authentication token provided:', {
        hasAuthHeader: !!authHeader,
        route: req.path,
        method: req.method
      });

      return res.status(401).json({
        error: 'Firebase authentication required',
        code: 'AUTH_REQUIRED',
        details: 'Please provide Firebase ID token in Authorization header (Bearer <token>)'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      console.log('🔍 [DEBUG] Attempting Firebase token verification...');
      // Verify Firebase token
      const decodedToken = await firebaseAdminService.verifyIdToken(idToken);
      console.log('✅ [DEBUG] Firebase token verified:', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        email_verified: decodedToken.email_verified
      });

      if (!decodedToken.email) {
        return res.status(400).json({
          error: 'Firebase user has no email',
          code: 'EMAIL_MISSING'
        });
      }

      // Load user from database to verify role
      console.log('🔍 [DEBUG] Loading user from Supabase...');
      const { user, role } = await getOrCreateSupabaseUser(
        decodedToken.uid,
        decodedToken.email
      );
      console.log('✅ [DEBUG] User loaded from Supabase:', {
        userId: user?.id,
        email: user?.email,
        role: role,
        hasUser: !!user
      });

      // Verify user has student role (or admin for testing)
      console.log('🔍 [DEBUG] Checking role authorization:', {
        currentRole: role,
        requiredRole: 'student or admin',
        isAuthorized: role === 'student' || role === 'admin'
      });

      if (role !== 'student' && role !== 'admin') {
        console.error('❌ [DEBUG] Authorization FAILED - Invalid role:', {
          email: decodedToken.email,
          role,
          uid: decodedToken.uid,
          route: req.path
        });

        return res.status(403).json({
          error: 'Student privileges required',
          code: 'STUDENT_REQUIRED',
          details: 'This route is only accessible to students'
        });
      }

      // Attach verified student info to request
      req.firebaseUser = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: role as 'student' | 'admin',
        emailVerified: decodedToken.email_verified || false
      };

      console.log('✅ Student authenticated (Firebase):', {
        email: decodedToken.email,
        role,
        route: req.path
      });

      return next();
    } catch (firebaseError: any) {
      console.error('❌ [DEBUG] Firebase authentication FAILED:', {
        error: firebaseError.message,
        code: firebaseError.code,
        stack: firebaseError.stack?.split('\n')[0],
        route: req.path
      });
      
      return res.status(401).json({
        error: 'Firebase authentication failed',
        code: 'FIREBASE_AUTH_FAILED',
        details: firebaseError.message
      });
    }

  } catch (error: any) {
    console.error('❌ Student authentication error:', error.message);

    // Specific error handling
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Authentication token expired',
        code: 'TOKEN_EXPIRED',
        details: 'Please re-authenticate to continue'
      });
    }

    return res.status(403).json({
      error: error.message || 'Authentication failed',
      code: 'AUTH_FAILED',
      details: 'Unable to verify student credentials'
    });
  }
};
