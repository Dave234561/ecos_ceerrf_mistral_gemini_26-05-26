import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, X, Copy, CheckCircle, Calendar, Users, BookOpen } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ScenarioBasic } from '@/types/scenario';

interface CreateTrainingSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateTrainingSessionModal({
  open,
  onOpenChange,
}: CreateTrainingSessionModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teacherEmails, setTeacherEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [selectedScenarios, setSelectedScenarios] = useState<number[]>([]);
  const [expirationDays, setExpirationDays] = useState(365);
  const [enrollmentUrl, setEnrollmentUrl] = useState<string | null>(null);

  // Fetch scenarios
  const {
    data: scenarios,
    isLoading: scenariosLoading,
    isError: scenariosError
  } = useQuery<ScenarioBasic[]>({
    queryKey: ['scenarios'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/scenarios');

      // Validate that response contains scenarios array
      if (!Array.isArray(response?.scenarios)) {
        throw new Error('API returned invalid scenarios data');
      }

      return response.scenarios;
    }
  });

  // Create session mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      teacherEmails: string[];
      scenarioIds: number[];
      tokenExpiresAt: string;
    }) => {
      // Use apiRequest with retry disabled for POST operations
      // This prevents duplicate session creation on retries
      const response = await apiRequest('POST', '/api/training-sessions/with-teachers', data, {
        skipQueue: true  // Bypass request queue to disable automatic retries
      });
      return response;
    },
    onSuccess: (data) => {
      setEnrollmentUrl(data.enrollmentUrl);
      toast({
        title: 'Session créée avec succès!',
        description: 'Partagez le lien d\'inscription avec vos étudiants.',
      });
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de créer la session de formation.',
        variant: 'destructive',
      });
    },
    // Prevent multiple simultaneous submissions
    retry: false
  });

  const handleAddEmail = () => {
    const email = currentEmail.trim().toLowerCase();
    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: 'Email invalide',
        description: 'Veuillez entrer une adresse email valide.',
        variant: 'destructive',
      });
      return;
    }

    if (teacherEmails.includes(email)) {
      toast({
        title: 'Email déjà ajouté',
        description: 'Cet enseignant est déjà dans la liste.',
        variant: 'destructive',
      });
      return;
    }

    setTeacherEmails([...teacherEmails, email]);
    setCurrentEmail('');
  };

  const handleRemoveEmail = (email: string) => {
    setTeacherEmails(teacherEmails.filter(e => e !== email));
  };

  const handleToggleScenario = (scenarioId: number) => {
    if (selectedScenarios.includes(scenarioId)) {
      setSelectedScenarios(selectedScenarios.filter(id => id !== scenarioId));
    } else {
      setSelectedScenarios([...selectedScenarios, scenarioId]);
    }
  };

  const handleSubmit = () => {
    // Validation
    if (!title.trim()) {
      toast({
        title: 'Titre requis',
        description: 'Veuillez entrer un titre pour la session.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedScenarios.length === 0) {
      toast({
        title: 'Scénarios requis',
        description: 'Veuillez sélectionner au moins un scénario.',
        variant: 'destructive',
      });
      return;
    }

    // Calculate expiration date
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + expirationDays);

    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      teacherEmails,
      scenarioIds: selectedScenarios,
      tokenExpiresAt: tokenExpiresAt.toISOString()
    });
  };

  const handleCopyUrl = () => {
    if (enrollmentUrl) {
      navigator.clipboard.writeText(enrollmentUrl);
      toast({
        title: 'Lien copié!',
        description: 'Le lien d\'inscription a été copié dans le presse-papiers.',
      });
    }
  };

  const handleClose = () => {
    // Reset form
    setTitle('');
    setDescription('');
    setTeacherEmails([]);
    setCurrentEmail('');
    setSelectedScenarios([]);
    setExpirationDays(365);
    setEnrollmentUrl(null);
    onOpenChange(false);
  };

  // If enrollment URL is generated, show success view
  if (enrollmentUrl) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <DialogTitle>Session créée avec succès!</DialogTitle>
            </div>
            <DialogDescription>
              Partagez ce lien avec vos étudiants pour qu'ils rejoignent la session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2">Lien d'inscription</Label>
              <div className="flex space-x-2">
                <Input
                  value={enrollmentUrl}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  onClick={handleCopyUrl}
                  variant="outline"
                  size="icon"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-sm">
                Les étudiants qui cliquent sur ce lien seront automatiquement inscrits à votre session
                et pourront accéder aux scénarios assignés. Le lien expire dans {expirationDays} jours.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Main form view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une session de formation</DialogTitle>
          <DialogDescription>
            Configurez une session avec plusieurs enseignants et générez un lien d'inscription unique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Title and Description */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Titre de la session *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Formation ECOS - Promotion 2024"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optionnel)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez les objectifs de cette session..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Teacher Emails */}
          <div>
            <Label className="flex items-center space-x-2 mb-2">
              <Users className="h-4 w-4" />
              <span>Enseignants co-assignés (optionnel)</span>
            </Label>
            <div className="flex space-x-2 mb-2">
              <Input
                value={currentEmail}
                onChange={(e) => setCurrentEmail(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder="email@example.com"
                className="flex-1"
              />
              <Button
                onClick={handleAddEmail}
                variant="outline"
                size="icon"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {teacherEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {teacherEmails.map((email) => (
                  <div
                    key={email}
                    className="bg-blue-50 border border-blue-200 rounded px-3 py-1 flex items-center space-x-2"
                  >
                    <span className="text-sm text-blue-900">{email}</span>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Ces enseignants auront accès au dashboard et aux données des étudiants de cette session.
            </p>
          </div>

          {/* Scenarios Selection */}
          <div>
            <Label className="flex items-center space-x-2 mb-2">
              <BookOpen className="h-4 w-4" />
              <span>Scénarios à inclure *</span>
            </Label>
            {scenariosLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : scenariosError ? (
              <div className="text-center py-8 text-red-600">
                <p className="font-medium">Erreur de chargement des scénarios</p>
                <p className="text-sm mt-1">Impossible de charger la liste des scénarios.</p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {Array.isArray(scenarios) && scenarios.map((scenario: ScenarioBasic) => (
                  <label
                    key={scenario.id}
                    className="flex items-start p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario.id)}
                      onChange={() => handleToggleScenario(scenario.id)}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{scenario.title}</div>
                      {scenario.description && (
                        <div className="text-xs text-gray-600 mt-1">
                          {scenario.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {selectedScenarios.length} scénario(s) sélectionné(s)
            </p>
          </div>

          {/* Expiration */}
          <div>
            <Label htmlFor="expiration" className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Durée de validité du lien (jours)</span>
            </Label>
            <Input
              id="expiration"
              type="number"
              min="1"
              max="730"
              value={expirationDays}
              onChange={(e) => setExpirationDays(parseInt(e.target.value) || 365)}
              className="mt-1 w-32"
            />
            <p className="text-xs text-gray-500 mt-1">
              Le lien expirera le{' '}
              {new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            disabled={createMutation.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || scenariosError || !Array.isArray(scenarios) || scenarios.length === 0}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Création...
              </>
            ) : (
              'Créer la session'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
