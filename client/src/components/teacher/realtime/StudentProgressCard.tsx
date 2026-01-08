import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStudentProgress, type ActiveStudent } from "@/hooks/useRealtimeProgress";
import { X, RefreshCw, TrendingUp, TrendingDown, Clock } from "lucide-react";

interface StudentProgressCardProps {
  student: ActiveStudent;
  teacherEmail?: string;  // Optional: no longer needed (auth via Firebase token)
  onClose: () => void;
}

export default function StudentProgressCard({ student, onClose }: StudentProgressCardProps) {
  // 🔒 SECURED: Teacher email retrieved from Firebase token automatically
  const { data, isLoading, refetch } = useStudentProgress(
    student.sessionId
  );

  const snapshots = data?.snapshots || [];
  const globalScore = data?.globalScore;
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : student.lastSnapshot;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getIndicatorColor = (value?: number) => {
    if (!value) return "text-gray-400";
    if (value >= 0.8) return "text-green-600";
    if (value >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = (value?: number) => {
    if (!value) return "bg-gray-200";
    if (value >= 0.8) return "bg-green-500";
    if (value >= 0.6) return "bg-yellow-500";
    return "bg-red-500";
  };

  const renderProgressIndicator = (label: string, value?: number, icon?: React.ReactNode) => {
    const percentage = (value || 0) * 100;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </div>
          <span className={`text-sm font-bold ${getIndicatorColor(value)}`}>
            {value ? `${percentage.toFixed(0)}%` : 'N/A'}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(value)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl">
              {(student.studentEmail || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-2xl">{student.studentEmail || 'Email inconnu'}</CardTitle>
              <CardDescription className="mt-1">
                {student.scenarioTitle || `Scénario ${student.scenarioId}`} • Session {student.sessionId?.split('_')[1] || 'N/A'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Progress Indicators */}
      <Card>
        <CardHeader>
          <CardTitle>Indicateurs de Progression</CardTitle>
          <CardDescription>
            Dernière mise à jour: {latestSnapshot?.timestamp ? formatTimestamp(latestSnapshot.timestamp) : 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderProgressIndicator(
            "Engagement",
            latestSnapshot?.progressIndicators?.engagement_score,
            <TrendingUp className="h-4 w-4 text-blue-600" />
          )}
          {renderProgressIndicator(
            "Qualité des Questions",
            latestSnapshot?.progressIndicators?.question_quality,
            <TrendingUp className="h-4 w-4 text-purple-600" />
          )}
          {renderProgressIndicator(
            "Niveau d'Empathie",
            latestSnapshot?.progressIndicators?.empathy_level,
            <TrendingUp className="h-4 w-4 text-pink-600" />
          )}
          {renderProgressIndicator(
            "Raisonnement Clinique",
            latestSnapshot?.progressIndicators?.clinical_reasoning,
            <TrendingUp className="h-4 w-4 text-green-600" />
          )}

          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Nombre d'échanges:</span>
              <Badge variant="outline" className="font-mono text-base">
                {latestSnapshot?.exchangeCount || 0}
              </Badge>
            </div>
            
            {/* Global Score from Evaluation */}
            {globalScore !== null && globalScore !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">Résultat Global:</span>
                <Badge 
                  variant="outline" 
                  className={`font-mono text-lg font-bold ${
                    globalScore >= 75 ? 'bg-green-50 text-green-700 border-green-300' :
                    globalScore >= 50 ? 'bg-yellow-50 text-yellow-700 border-yellow-300' :
                    'bg-red-50 text-red-700 border-red-300'
                  }`}
                >
                  {globalScore}%
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Strengths and Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Points Forts Actuels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestSnapshot?.strengths && latestSnapshot.strengths.length > 0 ? (
              <div className="space-y-2">
                {latestSnapshot.strengths.map((strength, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-green-50 rounded-lg">
                    <span className="text-green-600 font-bold mt-0.5">✓</span>
                    <span className="text-sm text-gray-700">{strength}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun point fort identifié pour le moment</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Points à Améliorer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestSnapshot?.weaknesses && latestSnapshot.weaknesses.length > 0 ? (
              <div className="space-y-2">
                {latestSnapshot.weaknesses.map((weakness, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                    <span className="text-red-600 font-bold mt-0.5">!</span>
                    <span className="text-sm text-gray-700">{weakness}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun point faible identifié pour le moment</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Historique de Progression
          </CardTitle>
          <CardDescription>
            {snapshots.length} snapshot(s) enregistré(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && snapshots.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Chargement...</span>
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Aucun historique disponible</p>
          ) : (
            <div className="space-y-4">
              {snapshots.slice().reverse().map((snapshot, index) => {
                const isLatest = index === 0;
                return (
                  <div
                    key={snapshot.id}
                    className={`relative pl-8 pb-4 ${index < snapshots.length - 1 ? 'border-l-2 border-gray-200' : ''}`}
                  >
                    <div
                      className={`absolute left-0 top-0 -ml-2 h-4 w-4 rounded-full ${
                        isLatest ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-gray-400'
                      }`}
                    />
                    <div className={`${isLatest ? 'bg-blue-50' : 'bg-gray-50'} rounded-lg p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-600">
                          {formatTimestamp(snapshot.timestamp)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {snapshot.exchangeCount} échanges
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">Indicateurs:</p>
                          <div className="space-y-1 text-xs">
                            {snapshot.progressIndicators?.engagement_score !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Engagement:</span>
                                <span className={getIndicatorColor(snapshot.progressIndicators.engagement_score)}>
                                  {(snapshot.progressIndicators.engagement_score * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                            {snapshot.progressIndicators?.empathy_level !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Empathie:</span>
                                <span className={getIndicatorColor(snapshot.progressIndicators.empathy_level)}>
                                  {(snapshot.progressIndicators.empathy_level * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            Points forts: {snapshot.strengths?.length || 0}
                          </p>
                          <p className="text-xs font-semibold text-gray-700">
                            À améliorer: {snapshot.weaknesses?.length || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
