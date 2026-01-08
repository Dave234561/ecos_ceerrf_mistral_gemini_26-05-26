import { Router, Request, Response } from 'express';
import { requireTeacher } from '../middleware/firebase-auth.middleware';

const router = Router();

/**
 * Debug endpoint to test authentication
 * GET /api/debug/auth-test
 */
router.get('/auth-test', requireTeacher, async (req: any, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Authentication successful!',
      user: {
        uid: req.firebaseUser?.uid,
        email: req.firebaseUser?.email,
        role: req.firebaseUser?.role,
        emailVerified: req.firebaseUser?.emailVerified
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
