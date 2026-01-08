import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, UserPlus, CheckCircle, Edit, Trash2, Plus, BookOpen, Users, UserMinus, X, Link2, Copy, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import CreateTrainingSessionModal from "@/components/teacher/CreateTrainingSessionModal";
import { useToast } from "@/hooks/use-toast";
import {
  ScenarioBasic,
  Teacher,
  AssignedTeacher,
  EnrolledStudent,
  TrainingSessionFormData,
  TrainingSessionResponse,
  ApiError
} from "@/types/scenario";

interface TrainingSessionsTabProps {
  email: string;
}

interface TrainingSession {
  id: number;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  scenarios: Array<{
    id: number;
    title: string;
    description: string;
  }>;
  studentCount: number;
  students?: EnrolledStudent[];
  enrollment_token?: string;
  token_expires_at?: string;
}

interface CreateTrainingSessionFormProps {
  email: string;
  scenarios: ScenarioBasic[];
  onSuccess: () => void;
  editingSession?: TrainingSession | null;
  onCancelEdit?: () => void;
}

interface RemoveStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainingSession: TrainingSession;
  email: string;
  onSuccess: () => void;
}

interface EnrolledStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainingSession: TrainingSession;
  email: string;
  onSuccess: () => void;
}

interface EnrollmentLinkDisplayProps {
  enrollmentToken: string;
}

const COPIED_STATE_TIMEOUT_MS = 2000;

// Component to display and copy enrollment link
function EnrollmentLinkDisplay({ enrollmentToken }: EnrollmentLinkDisplayProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const baseUrl = window.location.origin;
  const enrollmentUrl = `${baseUrl}/enroll/${enrollmentToken}`;

  // Cleanup timeout to prevent memory leak if component unmounts
  useEffect(() => {
    if (!copied) {
      return;
    }

    const timerId = setTimeout(() => {
      setCopied(false);
    }, COPIED_STATE_TIMEOUT_MS);

    return () => clearTimeout(timerId);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(enrollmentUrl);
      setCopied(true);
      toast({
        title: "Lien copié!",
        description: "Le lien d'inscription a été copié dans le presse-papiers.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de copier le lien.",
      });
    }
  };

  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-blue-900 mb-1">Lien d'inscription pour les étudiants:</p>
          <p className="text-sm text-blue-700 font-mono truncate">{enrollmentUrl}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="flex-shrink-0 border-blue-300 hover:bg-blue-100"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-1 text-green-600" />
              Copié!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1" />
              Copier
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function EnrolledStudentsModal({ isOpen, onClose, trainingSession, email, onSuccess }: EnrolledStudentsModalProps) {
  const [removingStudent, setRemovingStudent] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch detailed training session to get students list
  const { data: sessionDetails } = useQuery({
    queryKey: ['training-session-details', trainingSession.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/training-sessions/${trainingSession.id}?email=${encodeURIComponent(email)}`);
      return response.trainingSession;
    },
    enabled: isOpen && !!trainingSession.id,
  });

  const handleRemoveStudent = async (studentEmail: string) => {
    const confirmMessage = `Êtes-vous sûr de vouloir désinscrire ${studentEmail} de cette session de formation ?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    setRemovingStudent(studentEmail);
    try {
      // Get current students and remove the selected one
      const currentStudents = sessionDetails?.students || [];
      const remainingStudents = currentStudents
        .filter((student: EnrolledStudent) => student.studentEmail !== studentEmail)
        .map((student: EnrolledStudent) => student.studentEmail);

      await apiRequest('PUT', `/api/training-sessions/${trainingSession.id}`, {
        email,
        studentEmails: remainingStudents
      });

      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-session-details'] });

      toast({
        title: "Étudiant désinscrit",
        description: `${studentEmail} a été désinscrit avec succès de la session.`,
      });
      onSuccess();
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Erreur lors de la suppression : ${apiError.message}`,
      });
    } finally {
      setRemovingStudent(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Étudiants Inscrits</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-gray-600 mb-4">
          Session de formation : "{trainingSession.title}"
        </p>

        {sessionDetails?.students && sessionDetails.students.length > 0 ? (
          <div className="space-y-3 mb-6">
            {sessionDetails.students.map((student: EnrolledStudent) => (
              <div key={student.studentEmail} className="flex items-center justify-between p-3 border rounded">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {student.studentEmail}
                  </p>
                  <p className="text-xs text-gray-500">
                    Inscrit le {new Date(student.assignedAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveStudent(student.studentEmail)}
                  disabled={removingStudent === student.studentEmail}
                >
                  <UserMinus className="w-4 h-4 mr-1" />
                  {removingStudent === student.studentEmail ? "Suppression..." : "Désinscrire"}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            Aucun étudiant inscrit à cette session
          </p>
        )}

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

function RemoveStudentsModal({ isOpen, onClose, trainingSession, email, onSuccess }: RemoveStudentsModalProps) {
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isRemoving, setIsRemoving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch detailed training session to get students list
  const { data: sessionDetails } = useQuery({
    queryKey: ['training-session-details', trainingSession.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/training-sessions/${trainingSession.id}?email=${encodeURIComponent(email)}`);
      return response.trainingSession;
    },
    enabled: isOpen && !!trainingSession.id,
  });

  const handleRemoveStudents = async () => {
    if (selectedStudents.length === 0) {
      toast({
        variant: "destructive",
        title: "Aucune sélection",
        description: "Veuillez sélectionner au moins un étudiant à supprimer.",
      });
      return;
    }

    const confirmMessage = `Êtes-vous sûr de vouloir désinscrire ${selectedStudents.length} étudiant(s) de cette session de formation ?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    setIsRemoving(true);
    try {
      // Get current students and remove selected ones
      const currentStudents = sessionDetails?.students || [];
      const remainingStudents = currentStudents
        .filter((student: EnrolledStudent) => !selectedStudents.includes(student.studentEmail))
        .map((student: EnrolledStudent) => student.studentEmail);

      await apiRequest('PUT', `/api/training-sessions/${trainingSession.id}`, {
        email,
        studentEmails: remainingStudents
      });

      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-session-details'] });

      toast({
        title: "Étudiants désinscrits",
        description: `${selectedStudents.length} étudiant(s) ont été désinscrits avec succès.`,
      });
      setSelectedStudents([]);
      onSuccess();
      onClose();
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Erreur lors de la suppression : ${apiError.message}`,
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const toggleStudent = (studentEmail: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentEmail)
        ? prev.filter(email => email !== studentEmail)
        : [...prev, studentEmail]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Supprimer des Utilisateurs</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-gray-600 mb-4">
          Sélectionnez les étudiants à désinscrire de la session "{trainingSession.title}"
        </p>

        {sessionDetails?.students && sessionDetails.students.length > 0 ? (
          <div className="space-y-3 mb-6">
            {sessionDetails.students.map((student: EnrolledStudent) => (
              <div key={student.studentEmail} className="flex items-center space-x-2 p-3 border rounded">
                <Checkbox
                  id={`student-${student.studentEmail}`}
                  checked={selectedStudents.includes(student.studentEmail)}
                  onCheckedChange={() => toggleStudent(student.studentEmail)}
                />
                <div className="flex-1">
                  <label htmlFor={`student-${student.studentEmail}`} className="text-sm font-medium cursor-pointer">
                    {student.studentEmail}
                  </label>
                  <p className="text-xs text-gray-500">
                    Inscrit le {new Date(student.assignedAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            Aucun étudiant inscrit à cette session
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isRemoving}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleRemoveStudents}
            disabled={isRemoving || selectedStudents.length === 0}
          >
            <UserMinus className="w-4 h-4 mr-2" />
            {isRemoving ? "Suppression..." : `Supprimer (${selectedStudents.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateTrainingSessionForm({ email, scenarios, onSuccess, editingSession, onCancelEdit }: CreateTrainingSessionFormProps) {
  const [formData, setFormData] = useState({
    title: editingSession?.title || "",
    description: editingSession?.description || "",
    startDate: editingSession?.startDate ? new Date(editingSession.startDate).toISOString().slice(0, 16) : "",
    endDate: editingSession?.endDate ? new Date(editingSession.endDate).toISOString().slice(0, 16) : "",
    selectedScenarios: editingSession?.scenarios?.map(s => s.id) || [],
    studentEmails: [],
  });

  const [studentEmailsText, setStudentEmailsText] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch available teachers
  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ['teachers'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/teachers');
      return Array.isArray(response.teachers) ? response.teachers : [];
    }
  });

  // Fetch currently assigned teachers if editing
  const { data: assignedTeachers } = useQuery<AssignedTeacher[]>({
    queryKey: ['session-teachers', editingSession?.id],
    queryFn: async () => {
      if (!editingSession?.id) return [];
      const response = await apiRequest('GET', `/api/training-sessions/${editingSession.id}/teachers`);
      return Array.isArray(response.teachers) ? response.teachers : [];
    },
    enabled: !!editingSession?.id
  });

  // Set selected teachers when assigned teachers are loaded
  useEffect(() => {
    if (assignedTeachers && assignedTeachers.length > 0) {
      setSelectedTeachers(assignedTeachers.map((t: AssignedTeacher) => t.teacher_email));
    }
  }, [assignedTeachers]);

  const createMutation = useMutation<TrainingSessionResponse, ApiError, TrainingSessionFormData>({
    mutationFn: async (data: TrainingSessionFormData) => {
      if (editingSession) {
        return apiRequest('PUT', `/api/training-sessions/${editingSession.id}`, {
          email,
          ...data
        });
      } else {
        return apiRequest('POST', '/api/training-sessions', {
          email,
          ...data
        });
      }
    },
    onSuccess: async (response: TrainingSessionResponse) => {
      // Get the session ID (from response or editingSession)
      const sessionId = editingSession?.id || response?.trainingSession?.id;

      // Assign teachers to the session if any are selected
      if (sessionId && selectedTeachers.length > 0) {
        try {
          await apiRequest('POST', `/api/training-sessions/${sessionId}/teachers`, {
            email,
            teacherEmails: selectedTeachers
          });
          console.log(`✅ Assigned ${selectedTeachers.length} teacher(s) to session ${sessionId}`);
        } catch (error) {
          const apiError = error as ApiError;
          console.error('Error assigning teachers:', apiError);
          // Don't fail the whole operation if teacher assignment fails
          toast({
            variant: "destructive",
            title: "Attention",
            description: `Session créée mais erreur lors de l'assignation des enseignants: ${apiError.message}`,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session-teachers'] });
      setFormData({
        title: "",
        description: "",
        startDate: "",
        endDate: "",
        selectedScenarios: [],
        studentEmails: [],
      });
      setStudentEmailsText("");
      setSelectedTeachers([]);
      if (onCancelEdit) onCancelEdit();
      onSuccess();
      toast({
        title: "Succès",
        description: `Session de formation ${editingSession ? 'modifiée' : 'créée'} avec succès !`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Erreur lors de la ${editingSession ? 'modification' : 'création'} de la session : ${error.message}`,
      });
    }
  });

  const handleSubmit = () => {
    if (!formData.title || !formData.startDate || !formData.endDate) {
      toast({
        variant: "destructive",
        title: "Champs obligatoires manquants",
        description: "Veuillez remplir tous les champs obligatoires.",
      });
      return;
    }

    if (new Date(formData.startDate) >= new Date(formData.endDate)) {
      toast({
        variant: "destructive",
        title: "Dates invalides",
        description: "La date de fin doit être postérieure à la date de début.",
      });
      return;
    }

    // Parse student emails
    const newEmails = studentEmailsText
      .split(/[,\n]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    // Si on modifie une session existante, on ne met à jour que les nouveaux emails
    // Les utilisateurs existants sont préservés
    let submitData = {
      ...formData,
      scenarioIds: formData.selectedScenarios,
    };

    if (editingSession) {
      // En mode modification, on n'envoie les emails que s'il y en a de nouveaux à ajouter
      if (newEmails.length > 0) {
        submitData.studentEmails = newEmails;
      }
    } else {
      // En mode création, on envoie tous les emails
      submitData.studentEmails = newEmails;
    }

    createMutation.mutate(submitData);
  };

  const toggleScenario = (scenarioId: number) => {
    setFormData(prev => ({
      ...prev,
      selectedScenarios: prev.selectedScenarios.includes(scenarioId)
        ? prev.selectedScenarios.filter(id => id !== scenarioId)
        : [...prev.selectedScenarios, scenarioId]
    }));
  };

  const toggleTeacher = (teacherEmail: string) => {
    setSelectedTeachers(prev =>
      prev.includes(teacherEmail)
        ? prev.filter(email => email !== teacherEmail)
        : [...prev, teacherEmail]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editingSession ? "Modifier la Session de Formation" : "Créer une Nouvelle Session de Formation"}
        </CardTitle>
        <CardDescription>
          Une session de formation regroupe plusieurs scénarios ECOS disponibles pour un groupe d'étudiants pendant une période définie
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="title">Titre de la Session *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Ex: Formation Cardiologie - Semaine 1"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description de la session de formation..."
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startDate">Date et Heure de Début *</Label>
            <Input
              id="startDate"
              type="datetime-local"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="endDate">Date et Heure de Fin *</Label>
            <Input
              id="endDate"
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label>Scénarios ECOS à Inclure</Label>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
            {scenarios.map((scenario) => (
              <div key={scenario.id} className="flex items-start space-x-2 p-3 border rounded">
                <Checkbox
                  id={`scenario-${scenario.id}`}
                  checked={formData.selectedScenarios.includes(scenario.id)}
                  onCheckedChange={() => toggleScenario(scenario.id)}
                />
                <div className="flex-1">
                  <label htmlFor={`scenario-${scenario.id}`} className="text-sm font-medium cursor-pointer">
                    {scenario.title}
                  </label>
                  <p className="text-xs text-gray-600 mt-1">{scenario.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {formData.selectedScenarios.length} scénario(s) sélectionné(s)
          </p>
        </div>

        <div>
          <Label>Enseignants Autorisés (optionnel)</Label>
          {teachersLoading ? (
            <div className="mt-2 text-sm text-gray-500">Chargement des enseignants...</div>
          ) : teachers && teachers.length > 0 ? (
            <>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                {teachers.map((teacher: Teacher) => (
                  <div key={teacher.email} className="flex items-start space-x-2 p-3 border rounded">
                    <Checkbox
                      id={`teacher-${teacher.email}`}
                      checked={selectedTeachers.includes(teacher.email)}
                      onCheckedChange={() => toggleTeacher(teacher.email)}
                    />
                    <div className="flex-1">
                      <label htmlFor={`teacher-${teacher.email}`} className="text-sm font-medium cursor-pointer">
                        {teacher.email}
                      </label>
                      <p className="text-xs text-gray-600 mt-1">
                        {teacher.role === 'admin' ? 'Administrateur' : 'Enseignant'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {selectedTeachers.length} enseignant(s) sélectionné(s). Ces enseignants pourront consulter et modifier cette session.
              </p>
            </>
          ) : (
            <div className="mt-2 text-sm text-gray-500">
              Aucun enseignant disponible. Les enseignants doivent avoir un compte avec le rôle 'teacher' ou 'admin'.
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="studentEmails">Emails des Étudiants (optionnel)</Label>
          <Textarea
            id="studentEmails"
            value={studentEmailsText}
            onChange={(e) => setStudentEmailsText(e.target.value)}
            placeholder="etudiant1@email.com, etudiant2@email.com&#10;ou un email par ligne..."
            rows={4}
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">
            Séparez les emails par des virgules ou des retours à la ligne. Les étudiants pourront accéder aux scénarios pendant la période définie.
          </p>
        </div>

        {editingSession && (
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() => setRemovingStudentsSession(editingSession)}
              className="w-full"
            >
              <UserMinus className="w-4 h-4 mr-2" />
              Supprimer des Utilisateurs
            </Button>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="flex-1"
          >
            {createMutation.isPending 
              ? (editingSession ? "Modification en cours..." : "Création en cours...") 
              : (editingSession ? "Modifier la Session" : "Créer la Session")
            }
          </Button>

          {editingSession && (
            <Button
              variant="outline"
              onClick={onCancelEdit}
              disabled={createMutation.isPending}
            >
              Annuler
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrainingSessionsTab({ email }: TrainingSessionsTabProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [deletingSession, setDeletingSession] = useState<TrainingSession | null>(null);
  const [removingStudentsSession, setRemovingStudentsSession] = useState<TrainingSession | null>(null);
  const [enrolledStudentsSession, setEnrolledStudentsSession] = useState<TrainingSession | null>(null);
  const [showTokenEnrollmentModal, setShowTokenEnrollmentModal] = useState(false);
  const { toast } = useToast();

  // Fetch training sessions
  const {
    data: trainingSessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
    error: sessionsErrorDetails
  } = useQuery({
    queryKey: ['training-sessions', email],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/training-sessions?email=${encodeURIComponent(email)}`);

      // Validate response type - throw error if not an array
      if (!Array.isArray(response.trainingSessions)) {
        throw new Error('API returned invalid data type for trainingSessions');
      }

      return response.trainingSessions;
    },
    enabled: !!email,
    retry: 1, // Only retry once
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch scenarios for the form
  const {
    data: scenarios,
    isError: scenariosError,
    error: scenariosErrorDetails
  } = useQuery({
    queryKey: ['ecos-scenarios', email],
    queryFn: async () => {
      try {
        // Try admin endpoint first
        const response = await apiRequest('GET', `/api/ecos/scenarios?email=${encodeURIComponent(email)}`);

        if (!Array.isArray(response.scenarios)) {
          throw new Error('Admin endpoint returned invalid data type for scenarios');
        }

        return response.scenarios;
      } catch (error) {
        // Fallback to student endpoint
        const fallbackResponse = await apiRequest('GET', `/api/student/available-scenarios?email=${encodeURIComponent(email)}`);

        if (!Array.isArray(fallbackResponse.scenarios)) {
          throw new Error('Student endpoint returned invalid data type for scenarios');
        }

        return fallbackResponse.scenarios;
      }
    },
    enabled: !!email,
  });

  const queryClient = useQueryClient();

  const deleteMutation = useMutation<void, ApiError, number>({
    mutationFn: async (sessionId: number) => {
      return apiRequest('DELETE', `/api/training-sessions/${sessionId}?email=${encodeURIComponent(email)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      setDeletingSession(null);
      toast({
        title: "Session supprimée",
        description: "La session de formation a été supprimée avec succès.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Erreur lors de la suppression : ${error.message}`,
      });
    }
  });

  const isSessionActive = (session: TrainingSession) => {
    const now = new Date();
    const start = new Date(session.startDate);
    const end = new Date(session.endDate);
    return now >= start && now <= end;
  };

  const getSessionStatus = (session: TrainingSession) => {
    const now = new Date();
    const start = new Date(session.startDate);
    const end = new Date(session.endDate);

    if (now < start) return 'planned';
    if (now > end) return 'completed';
    return 'active';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <Badge variant="secondary">Planifiée</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case 'completed':
        return <Badge variant="outline">Terminée</Badge>;
      default:
        return <Badge variant="secondary">Inconnue</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Sessions de Formation</h2>
          <p className="text-gray-600">Gérez les sessions de formation regroupant plusieurs scénarios ECOS</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCreateForm(true)}
            disabled={!scenarios?.length || scenariosError}
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle Session
          </Button>
          <Button
            onClick={() => setShowTokenEnrollmentModal(true)}
            disabled={!scenarios?.length || scenariosError}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Créer avec Lien d'Inscription
          </Button>
        </div>
      </div>

      {/* Error alert for scenarios */}
      {scenariosError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900">Impossible de charger les scénarios</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {scenariosErrorDetails?.message || 'Une erreur est survenue lors du chargement des scénarios. Vous ne pouvez pas créer de nouvelles sessions pour le moment.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingSession) && (
        <CreateTrainingSessionForm
          email={email}
          scenarios={scenarios || []}
          onSuccess={() => {
            setShowCreateForm(false);
            setEditingSession(null);
          }}
          editingSession={editingSession}
          onCancelEdit={() => {
            setShowCreateForm(false);
            setEditingSession(null);
          }}
        />
      )}

      {/* Training Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>Sessions de Formation</CardTitle>
          <CardDescription>
            {trainingSessions?.length || 0} session(s) de formation créée(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <p className="text-center py-8">Chargement des sessions...</p>
          ) : sessionsError ? (
            <div className="text-center py-12">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
                <div className="flex items-center justify-center mb-4">
                  <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-red-900 mb-2">
                  Erreur de chargement
                </h3>
                <p className="text-red-700 mb-4">
                  Impossible de charger les sessions de formation.
                </p>
                <p className="text-sm text-red-600 mb-4">
                  {sessionsErrorDetails?.message || 'Une erreur réseau est survenue'}
                </p>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  Réessayer
                </Button>
              </div>
            </div>
          ) : Array.isArray(trainingSessions) && trainingSessions.length > 0 ? (
            <div className="space-y-4">
              {trainingSessions.map((session: TrainingSession) => {
                const status = getSessionStatus(session);
                return (
                  <div key={session.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{session.title}</h3>
                          {getStatusBadge(status)}
                        </div>
                        {session.description && (
                          <p className="text-gray-600 text-sm mb-2">{session.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(session.startDate).toLocaleDateString('fr-FR')} - {new Date(session.endDate).toLocaleDateString('fr-FR')}
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {session.scenarios.length} scénario(s)
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {session.studentCount} étudiant(s)
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEnrolledStudentsSession(session)}
                        >
                          <Users className="w-4 h-4 mr-1" />
                          Inscrits
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingSession(session)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeletingSession(session)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Supprimer
                        </Button>
                      </div>
                    </div>

                    {/* Scenarios list */}
                    {session.scenarios.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-2">Scénarios inclus :</p>
                        <div className="flex flex-wrap gap-2">
                          {session.scenarios.map((scenario) => (
                            <Badge key={scenario.id} variant="outline" className="text-xs">
                              {scenario.title}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Enrollment link - Only show if enrollment_token exists */}
                    {session.enrollment_token && (
                      <EnrollmentLinkDisplay enrollmentToken={session.enrollment_token} />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune session de formation</h3>
              <p className="text-gray-600 mb-4">Créez votre première session de formation pour regrouper des scénarios ECOS</p>
              {scenarios?.length > 0 ? (
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer une session
                </Button>
              ) : (
                <p className="text-sm text-gray-500">Vous devez d'abord créer des scénarios ECOS</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrolled Students Modal */}
      {enrolledStudentsSession && (
        <EnrolledStudentsModal
          isOpen={!!enrolledStudentsSession}
          onClose={() => setEnrolledStudentsSession(null)}
          trainingSession={enrolledStudentsSession}
          email={email}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
          }}
        />
      )}

      {/* Remove Students Modal */}
      {removingStudentsSession && (
        <RemoveStudentsModal
          isOpen={!!removingStudentsSession}
          onClose={() => setRemovingStudentsSession(null)}
          trainingSession={removingStudentsSession}
          email={email}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmer la suppression</h3>
            <p className="text-gray-600 mb-6">
              Êtes-vous sûr de vouloir supprimer la session de formation "{deletingSession.title}" ?
              Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeletingSession(null)}
                disabled={deleteMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deletingSession.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Token-based Enrollment Modal */}
      <CreateTrainingSessionModal
        open={showTokenEnrollmentModal}
        onOpenChange={setShowTokenEnrollmentModal}
      />
    </div>
  );
}