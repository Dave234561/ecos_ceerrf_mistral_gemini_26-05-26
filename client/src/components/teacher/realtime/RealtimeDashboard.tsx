import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveStudents, type ActiveStudent } from "@/hooks/useRealtimeProgress";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Eye, RefreshCw, Users, Activity, MessageSquare } from "lucide-react";

interface RealtimeDashboardProps {
  teacherEmail?: string;  // Optional: no longer needed (auth via Firebase token)
  onViewDetails: (student: ActiveStudent) => void;
}

interface TrainingSession {
  id: number;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  status?: string;
}

export default function RealtimeDashboard({ onViewDetails }: RealtimeDashboardProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | undefined>(undefined);
  const [selectedTrainingSessionId, setSelectedTrainingSessionId] = useState<number | undefined>(undefined);

  // Fetch active students
  // 🔒 SECURED: Teacher email retrieved from Firebase token automatically
  const { data: students = [], isLoading, error, refetch } = useActiveStudents({
    scenarioId: selectedScenarioId,
    trainingSessionId: selectedTrainingSessionId
  });

  // Fetch scenarios for filter
  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/scenarios');
      return response.scenarios || [];
    }
  });

  // Fetch training sessions for filter
  const { data: trainingSessions = [] } = useQuery({
    queryKey: ['training-sessions-all'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/training-sessions');
      // Show ALL sessions (not just active ones) to allow filtering by any session
      return (response.trainingSessions || []).sort((a: TrainingSession, b: TrainingSession) => {
        // Sort by start date descending (most recent first)
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      });
    }
  });

  // Calculate stats
  const stats = {
    activeStudents: students.length,
    avgEngagement: students.length > 0
      ? students.reduce((sum, s) => sum + (s.lastSnapshot?.progressIndicators?.engagement_score || 0), 0) / students.length
      : 0,
    avgExchanges: students.length > 0
      ? students.reduce((sum, s) => sum + (s.lastSnapshot?.exchangeCount || 0), 0) / students.length
      : 0
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 1000 / 60);

    if (diffMinutes < 1) return "À l'instant";
    if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    return date.toLocaleDateString('fr-FR');
  };

  const getEngagementColor = (score?: number) => {
    if (!score) return "bg-gray-200";
    if (score >= 0.8) return "bg-green-500";
    if (score >= 0.6) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getEngagementLabel = (score?: number) => {
    if (!score) return "N/A";
    if (score >= 0.8) return "Élevé";
    if (score >= 0.6) return "Moyen";
    return "Faible";
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Erreur</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">Impossible de charger les données en temps réel.</p>
          <Button onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Étudiants Actifs</p>
                <p className="text-3xl font-bold text-blue-600">{stats.activeStudents}</p>
              </div>
              <Users className="h-10 w-10 text-blue-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Engagement Moyen</p>
                <p className="text-3xl font-bold text-green-600">
                  {(stats.avgEngagement * 100).toFixed(0)}%
                </p>
              </div>
              <Activity className="h-10 w-10 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Échanges Moyens</p>
                <p className="text-3xl font-bold text-purple-600">
                  {stats.avgExchanges.toFixed(1)}
                </p>
              </div>
              <MessageSquare className="h-10 w-10 text-purple-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main dashboard */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-xl font-semibold">
              Suivi en Temps Réel
            </CardTitle>
            <CardDescription className="mt-1">
              Mise à jour automatique toutes les 10 secondes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedTrainingSessionId?.toString() || "all"}
              onValueChange={(value) => setSelectedTrainingSessionId(value === "all" ? undefined : parseInt(value))}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Toutes les sessions" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                <SelectItem value="all">Toutes les sessions</SelectItem>
                {trainingSessions.map((session: TrainingSession) => (
                  <SelectItem key={session.id} value={session.id.toString()}>
                    {session.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedScenarioId?.toString() || "all"}
              onValueChange={(value) => setSelectedScenarioId(value === "all" ? undefined : parseInt(value))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Tous les scénarios" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                <SelectItem value="all">Tous les scénarios</SelectItem>
                {scenarios.map((scenario: any) => (
                  <SelectItem key={scenario.id} value={scenario.id.toString()}>
                    {scenario.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && students.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Chargement...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">Aucun étudiant actif pour le moment</p>
              <p className="text-sm text-gray-400 mt-1">
                Les étudiants apparaîtront ici dès qu'ils commenceront une session ECOS
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Étudiant
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Scénario
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      Engagement
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      Échanges
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Points Forts
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Points Faibles
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      Dernière Activité
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr
                      key={student.sessionId}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                            {(student.studentEmail || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              {student.studentEmail || 'Email inconnu'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Session {student.sessionId?.split('_')[1] || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-700">
                          {student.scenarioTitle || `Scénario ${student.scenarioId}`}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center">
                          <Badge
                            className={`${getEngagementColor(student.lastSnapshot?.progressIndicators?.engagement_score)} text-white`}
                          >
                            {getEngagementLabel(student.lastSnapshot?.progressIndicators?.engagement_score)}
                          </Badge>
                          <div className="w-full bg-gray-200 h-1 mt-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getEngagementColor(student.lastSnapshot?.progressIndicators?.engagement_score)}`}
                              style={{
                                width: `${(student.lastSnapshot?.progressIndicators?.engagement_score || 0) * 100}%`
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="outline" className="font-mono">
                          {student.lastSnapshot?.exchangeCount || 0}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(student.lastSnapshot?.strengths || []).slice(0, 2).map((strength, i) => (
                            <Badge key={i} variant="secondary" className="text-xs bg-green-100 text-green-800">
                              {strength.length > 20 ? strength.substring(0, 20) + '...' : strength}
                            </Badge>
                          ))}
                          {(student.lastSnapshot?.strengths?.length || 0) > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(student.lastSnapshot?.strengths?.length || 0) - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(student.lastSnapshot?.weaknesses || []).slice(0, 2).map((weakness, i) => (
                            <Badge key={i} variant="secondary" className="text-xs bg-red-100 text-red-800">
                              {weakness.length > 20 ? weakness.substring(0, 20) + '...' : weakness}
                            </Badge>
                          ))}
                          {(student.lastSnapshot?.weaknesses?.length || 0) > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(student.lastSnapshot?.weaknesses?.length || 0) - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <p className="text-xs text-gray-500">
                          {student.lastSnapshot?.timestamp
                            ? formatTimestamp(student.lastSnapshot.timestamp)
                            : 'N/A'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewDetails(student)}
                          className="hover:bg-blue-50"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
