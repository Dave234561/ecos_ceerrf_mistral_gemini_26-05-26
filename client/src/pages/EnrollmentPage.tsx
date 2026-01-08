import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Calendar, BookOpen } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import type { ScenarioBasic } from '@/types/scenario';

export default function EnrollmentPage() {
  const [, params] = useRoute('/enroll/:token');
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const token = params?.token || '';

  const [enrollmentStatus, setEnrollmentStatus] = useState<'idle' | 'success' | 'already_enrolled'>('idle');

  // Fetch session information by token (public, no auth required)
  const { data: sessionData, isLoading, error } = useQuery({
    queryKey: ['enrollment-session', token],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/enroll/${token}`);
      return response.session;
    },
    enabled: !!token,
    retry: false
  });

  // Enroll mutation (requires authentication)
  const enrollMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/enroll/${token}`, {});
      return response;
    },
    onSuccess: (data) => {
      if (data.alreadyEnrolled) {
        setEnrollmentStatus('already_enrolled');
      } else {
        setEnrollmentStatus('success');
      }

      // Redirect to scenarios page after 2 seconds
      setTimeout(() => {
        setLocation(`/student/${user?.email}`);
      }, 2000);
    },
    onError: (error: any) => {
      console.error('Enrollment failed:', error);
    }
  });

  const handleEnroll = () => {
    if (!user) {
      // Save enrollment token to sessionStorage before redirecting
      sessionStorage.setItem('enrollmentToken', token);
      sessionStorage.setItem('enrollmentSessionTitle', sessionData?.title || '');
      
      // Redirect to home page to authenticate
      alert('Veuillez vous connecter pour vous inscrire à cette session de formation.');
      setLocation('/');
      return;
    }

    enrollMutation.mutate();
  };

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600">Chargement des informations de la session...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error states
  if (error || !sessionData) {
    const errorMessage = error?.message || 'Session de formation introuvable';
    const isExpired = errorMessage.includes('ENROLLMENT_LINK_EXPIRED');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <CardTitle className="text-red-700">
                {isExpired ? 'Lien expiré' : 'Session introuvable'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                {isExpired
                  ? 'Ce lien d\'inscription a expiré. Contactez votre enseignant pour obtenir un nouveau lien.'
                  : 'Cette session de formation n\'existe pas ou le lien est invalide.'
                }
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => setLocation('/')}
              variant="outline"
              className="w-full"
            >
              Retour à l'accueil
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Success state
  if (enrollmentStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <CardTitle className="text-green-700">Inscription réussie!</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              Vous êtes maintenant inscrit(e) à la session <strong>{sessionData.title}</strong>.
            </p>
            <p className="text-gray-600 mt-2 text-sm">
              Redirection vers vos scénarios...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (enrollmentStatus === 'already_enrolled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-6 w-6 text-blue-600" />
              <CardTitle className="text-blue-700">Déjà inscrit(e)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              Vous êtes déjà inscrit(e) à la session <strong>{sessionData.title}</strong>.
            </p>
            <p className="text-gray-600 mt-2 text-sm">
              Redirection vers vos scénarios...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main enrollment view
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl text-blue-900">
              Inscription à une session de formation
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              Rejoignez cette session pour accéder aux scénarios ECOS assignés
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Session Information */}
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <h3 className="text-xl font-semibold text-blue-900 mb-2">
                {sessionData.title}
              </h3>
              {sessionData.description && (
                <p className="text-gray-700 mb-4">{sessionData.description}</p>
              )}

              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                <Calendar className="h-4 w-4" />
                <span>
                  Lien valide jusqu'au{' '}
                  {new Date(sessionData.expiresAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>

              {/* Scenarios List */}
              {sessionData.scenarios && sessionData.scenarios.length > 0 && (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <BookOpen className="h-5 w-5 text-blue-700" />
                    <h4 className="font-semibold text-blue-900">
                      Scénarios inclus ({sessionData.scenarios.length})
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {sessionData.scenarios.map((scenario: ScenarioBasic & { image_url?: string }) => (
                      <li key={scenario.id} className="bg-white p-3 rounded border border-gray-200">
                        <div className="flex items-start space-x-3">
                          {scenario.image_url && (
                            <img
                              src={scenario.image_url}
                              alt={scenario.title}
                              className="w-12 h-12 rounded object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{scenario.title}</p>
                            {scenario.description && (
                              <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Authentication notice */}
            {!user && (
              <Alert>
                <AlertDescription>
                  Vous devez être connecté(e) pour vous inscrire à cette session.
                  Cliquez sur le bouton ci-dessous pour vous connecter.
                </AlertDescription>
              </Alert>
            )}

            {/* User info if authenticated */}
            {user && (
              <div className="text-sm text-gray-600">
                Inscription en tant que: <strong>{user.email}</strong>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              onClick={() => setLocation('/')}
              variant="outline"
            >
              Annuler
            </Button>
            <Button
              onClick={handleEnroll}
              disabled={enrollMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {enrollMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscription...
                </>
              ) : (
                "S'inscrire à cette session"
              )}
            </Button>
          </CardFooter>

          {/* Error message */}
          {enrollMutation.isError && (
            <div className="px-6 pb-6">
              <Alert variant="destructive">
                <AlertDescription>
                  Une erreur est survenue lors de l'inscription. Veuillez réessayer.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
