/**
 * Firebase Admin Service
 *
 * Handles server-side Firebase operations:
 * - ID token verification
 * - User management
 * - Custom claims (roles)
 *
 * Uses dynamic imports to avoid crashing if firebase-admin is not available
 */

type App = any;
type DecodedIdToken = any;
type UserRecord = any;

class FirebaseAdminService {
  private initialized: boolean = false;
  private app: App | null = null;
  private initializationPromise: Promise<void> | null = null;
  private firebaseAdmin: any = null;
  private firebaseAuth: any = null;

  constructor() {
    // Don't initialize immediately - wait for first use
  }

  /**
   * Lazy load Firebase Admin modules
   */
  private async loadFirebaseModules() {
    if (this.firebaseAdmin && this.firebaseAuth) {
      return;
    }

    try {
      console.log('📦 Loading firebase-admin modules...');
      this.firebaseAdmin = await import('firebase-admin/app');
      this.firebaseAuth = await import('firebase-admin/auth');
      console.log('✅ Firebase Admin modules loaded successfully');
    } catch (error: any) {
      console.error('❌ Failed to load Firebase Admin modules:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      throw new Error(`Firebase Admin SDK not available: ${error.message}`);
    }
  }

  /**
   * Initialize Firebase Admin SDK (lazy initialization)
   */
  private async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.initialized) {
      return;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('🔥 Initializing Firebase Admin SDK...');

        await this.loadFirebaseModules();

        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!projectId || !clientEmail || !privateKey) {
          const missing = [];
          if (!projectId) missing.push('FIREBASE_PROJECT_ID');
          if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
          if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
          throw new Error(`Missing Firebase credentials: ${missing.join(', ')}`);
        }

        // Handle private key formatting for Vercel
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.substring(1, privateKey.length - 1);
        }
        const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

        console.log('🔧 Firebase Config:', {
          projectId,
          clientEmail,
          privateKeyLength: privateKey.length,
          hasNewLines: privateKey.includes('\n'),
          hasEscapedNewLines: privateKey.includes('\\n')
        });

        const existingApps = this.firebaseAdmin.getApps();
        if (existingApps.length === 0) {
          this.app = this.firebaseAdmin.initializeApp({
            credential: this.firebaseAdmin.cert({
              projectId,
              clientEmail,
              privateKey: formattedPrivateKey,
            }),
          });
          console.log('✅ Firebase app initialized');
        } else {
          this.app = existingApps[0];
          console.log('✅ Using existing Firebase app');
        }

        this.initialized = true;
      } catch (error: any) {
        console.error('❌ Firebase Admin SDK initialization failed:', {
          message: error.message,
          stack: error.stack
        });
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Verify Firebase ID token
   * @param idToken - Firebase ID token from client
   * @returns Decoded token with user info
   */
  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      const decodedToken = await auth.verifyIdToken(idToken);
      console.log('✅ Firebase ID token verified:', { uid: decodedToken.uid, email: decodedToken.email });
      return decodedToken;
    } catch (error) {
      console.error('❌ Firebase ID token verification failed:', error);
      throw new Error('Invalid or expired Firebase ID token');
    }
  }

  /**
   * Get user by email
   * @param email - User email
   * @returns Firebase user record
   */
  async getUserByEmail(email: string): Promise<UserRecord | null> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      const user = await auth.getUserByEmail(email);
      return user;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return null;
      }
      console.error('❌ Error fetching user by email:', error);
      throw error;
    }
  }

  /**
   * Get user by UID
   * @param uid - Firebase UID
   * @returns Firebase user record
   */
  async getUserByUid(uid: string): Promise<UserRecord | null> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      const user = await auth.getUser(uid);
      return user;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return null;
      }
      console.error('❌ Error fetching user by UID:', error);
      throw error;
    }
  }

  /**
   * Create a new Firebase user
   * @param email - User email
   * @param password - User password
   * @returns Created user record
   */
  async createUser(email: string, password: string): Promise<UserRecord> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      const user = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
      console.log('✅ Firebase user created:', { uid: user.uid, email: user.email });
      return user;
    } catch (error) {
      console.error('❌ Error creating Firebase user:', error);
      throw error;
    }
  }

  /**
   * Create a custom token the client exchanges for a Firebase session (signInWithCustomToken)
   * @param uid - Firebase UID
   */
  async createCustomToken(uid: string): Promise<string> {
    await this.initialize();
    return this.firebaseAuth.getAuth().createCustomToken(uid);
  }

  /**
   * Set custom user claims (roles)
   * @param uid - Firebase UID
   * @param claims - Custom claims object (e.g., { role: 'admin' })
   */
  async setCustomClaims(uid: string, claims: Record<string, any>): Promise<void> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      await auth.setCustomUserClaims(uid, claims);
      console.log('✅ Custom claims set for user:', { uid, claims });
    } catch (error) {
      console.error('❌ Error setting custom claims:', error);
      throw error;
    }
  }

  /**
   * Get custom claims for a user
   * @param uid - Firebase UID
   * @returns Custom claims object
   */
  async getCustomClaims(uid: string): Promise<Record<string, any>> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      const user = await auth.getUser(uid);
      return user.customClaims || {};
    } catch (error) {
      console.error('❌ Error getting custom claims:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   * @param email - User email
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      const link = await auth.generatePasswordResetLink(email);
      console.log('✅ Password reset link generated for:', email);
      console.log('🔗 Reset link:', link);
      // In production, you would send this via your email service
    } catch (error) {
      console.error('❌ Error generating password reset link:', error);
      throw error;
    }
  }

  /**
   * Delete a Firebase user
   * @param uid - Firebase UID
   */
  async deleteUser(uid: string): Promise<void> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      await auth.deleteUser(uid);
      console.log('✅ Firebase user deleted:', uid);
    } catch (error) {
      console.error('❌ Error deleting Firebase user:', error);
      throw error;
    }
  }

  /**
   * Update user email
   * @param uid - Firebase UID
   * @param newEmail - New email address
   */
  async updateUserEmail(uid: string, newEmail: string): Promise<void> {
    await this.initialize();
    try {
      const auth = this.firebaseAuth.getAuth();
      await auth.updateUser(uid, { email: newEmail });
      console.log('✅ User email updated:', { uid, newEmail });
    } catch (error) {
      console.error('❌ Error updating user email:', error);
      throw error;
    }
  }

  /**
   * Check if Firebase Admin is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const firebaseAdminService = new FirebaseAdminService();
