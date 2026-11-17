/**
 * LTI Launch Page
 *
 * Landing page after an LTI launch from the LMS: signs the user in with the
 * custom token issued by the backend, then opens the student interface.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { signInWithToken } from '@/lib/firebase';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  email_missing: "Votre plateforme de formation n'a pas transmis votre adresse email. Contactez votre administrateur.",
  privileged_account: 'Les comptes enseignant et administrateur doivent se connecter directement sur la plateforme ECOS.',
  replay: 'Ce lien de lancement a déjà été utilisé. Relancez l\'activité depuis votre cours.',
  invalid_state: 'Le lancement a expiré. Relancez l\'activité depuis votre cours.'
};
const DEFAULT_ERROR = "La connexion depuis votre plateforme de formation a échoué. Relancez l'activité depuis votre cours.";

export default function LtiLaunchPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    // Remove the token from the address bar and history
    window.history.replaceState({}, '', window.location.pathname);

    const token = params.get('token');
    if (!token) {
      setError(ERROR_MESSAGES[params.get('error') || ''] || DEFAULT_ERROR);
      return;
    }

    const scenario = params.get('scenario');
    signInWithToken(token)
      .then(() => setLocation(scenario ? `/student?scenario=${encodeURIComponent(scenario)}` : '/student'))
      .catch((err) => {
        console.error('❌ LTI sign in failed:', err.message);
        setError(DEFAULT_ERROR);
      });
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50 p-4">
      {error ? (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-neutral-600 text-sm">Connexion en cours...</p>
        </div>
      )}
    </div>
  );
}
