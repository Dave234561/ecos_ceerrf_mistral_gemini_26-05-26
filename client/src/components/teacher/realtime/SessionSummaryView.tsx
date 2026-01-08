import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionSummary, useGenerateSessionSummary } from "@/hooks/useRealtimeProgress";
import { Calendar, TrendingUp, TrendingDown, Users, FileText, Loader2, BarChart3 } from "lucide-react";

interface SessionSummaryViewProps {
  teacherEmail?: string;  // Optional: no longer needed (auth via Firebase token)
}

export default function SessionSummaryView(): JSX.Element {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // 🔒 SECURED: Teacher email retrieved from Firebase token automatically
  const { data: summary, isLoading, error, refetch } = useSessionSummary(
    selectedDate,
    { enabled: !!selectedDate }
  );

  const generateMutation = useGenerateSessionSummary();

  const handleGenerateSummary = async () => {
    if (!selectedDate) return;

    try {
      await generateMutation.mutateAsync({ sessionDate: selectedDate });
      // Refetch to get the newly generated summary
      refetch();
    } catch (error) {
      console.error('Failed to generate summary:', error);
    }
  };

  const renderTrendIndicator = (label: string, value?: number) => {
    if (value === undefined) return null;

    const percentage = (value * 100).toFixed(0);
    const color = value >= 0.8 ? 'text-green-600' : value >= 0.6 ? 'text-yellow-600' : 'text-red-600';
    const bgColor = value >= 0.8 ? 'bg-green-100' : value >= 0.6 ? 'bg-yellow-100' : 'bg-red-100';

    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full ${bgColor}`}>
            <span className={`text-sm font-bold ${color}`}>{percentage}%</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 mt-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Synthèse de Session
              </CardTitle>
              <CardDescription className="mt-1">
                Analyse globale des performances de la classe
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date Selection */}
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Sélectionner une date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={handleGenerateSummary}
                disabled={!selectedDate || generateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Générer Synthèse
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Error State */}
          {generateMutation.isError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                Erreur lors de la génération de la synthèse. Veuillez réessayer.
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Chargement de la synthèse...</span>
            </div>
          )}

          {/* No Data State */}
          {!isLoading && !summary && !error && (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aucune synthèse disponible pour cette date</p>
              <p className="text-sm text-gray-400 mt-1">
                Cliquez sur "Générer Synthèse" pour créer une nouvelle synthèse
              </p>
            </div>
          )}

          {/* Summary Display */}
          {summary && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-700">Total Étudiants</p>
                        <p className="text-3xl font-bold text-blue-900">{summary.totalStudents}</p>
                      </div>
                      <Users className="h-10 w-10 text-blue-600 opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-purple-700">Snapshots Totaux</p>
                        <p className="text-3xl font-bold text-purple-900">
                          {summary.summaryData?.totalSnapshots || 0}
                        </p>
                      </div>
                      <BarChart3 className="h-10 w-10 text-purple-600 opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-700">Échanges Moyens</p>
                        <p className="text-3xl font-bold text-green-900">
                          {summary.summaryData?.averageExchanges?.toFixed(1) || '0.0'}
                        </p>
                      </div>
                      <TrendingUp className="h-10 w-10 text-green-600 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Trends */}
              {summary.trends && Object.keys(summary.trends).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                      Tendances Moyennes de la Classe
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {renderTrendIndicator("Engagement", summary.trends.engagement_score)}
                    {renderTrendIndicator("Qualité des Questions", summary.trends.question_quality)}
                    {renderTrendIndicator("Niveau d'Empathie", summary.trends.empathy_level)}
                    {renderTrendIndicator("Raisonnement Clinique", summary.trends.clinical_reasoning)}
                  </CardContent>
                </Card>
              )}

              {/* Common Strengths and Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      Points Forts Récurrents
                    </CardTitle>
                    <CardDescription>
                      Compétences observées fréquemment dans la classe
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary.commonStrengths && summary.commonStrengths.length > 0 ? (
                      <div className="space-y-3">
                        {summary.commonStrengths.map((strength, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex-shrink-0 mt-0.5">
                              <div className="h-6 w-6 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm">
                                {i + 1}
                              </div>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{strength}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 py-4">Aucun point fort récurrent identifié</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                      Points Faibles Récurrents
                    </CardTitle>
                    <CardDescription>
                      Domaines nécessitant une attention particulière
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary.commonWeaknesses && summary.commonWeaknesses.length > 0 ? (
                      <div className="space-y-3">
                        {summary.commonWeaknesses.map((weakness, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex-shrink-0 mt-0.5">
                              <div className="h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-sm">
                                !
                              </div>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{weakness}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 py-4">Aucun point faible récurrent identifié</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Metadata */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t">
                <span>Synthèse générée le {new Date(summary.createdAt).toLocaleString('fr-FR')}</span>
                {summary.scenarioId && <span>Scénario: #{summary.scenarioId}</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
