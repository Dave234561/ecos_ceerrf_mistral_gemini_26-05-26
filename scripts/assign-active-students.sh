#!/bin/bash

# Script to auto-assign active students to training session for real-time monitoring
# This makes students visible in the teacher dashboard's "Suivi en temps réel" tab

# Configuration
API_URL="${API_URL:-https://ecos-infirmier-b-20.vercel.app}"
TEACHER_EMAIL="${TEACHER_EMAIL:-cherubindavid@gmail.com}"
SESSION_DATE="${1:-$(date +%Y-%m-%d)}"

echo "🚀 Auto-assigning active students for teacher: $TEACHER_EMAIL"
echo "📅 Session date: $SESSION_DATE"
echo "🌐 API URL: $API_URL"
echo ""

# Call the auto-assign API endpoint using legacy authentication (email in body)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/api/teacher/training-sessions/auto-assign-active-students" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEACHER_EMAIL\",
    \"sessionDate\": \"$SESSION_DATE\"
  }")

# Split response body and status code
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

echo "📊 HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Success!"
  echo ""
  echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"

  # Extract key info
  SUCCESS=$(echo "$HTTP_BODY" | jq -r '.success' 2>/dev/null)
  STUDENTS_COUNT=$(echo "$HTTP_BODY" | jq -r '.studentsAssigned' 2>/dev/null)
  SESSION_TITLE=$(echo "$HTTP_BODY" | jq -r '.sessionTitle' 2>/dev/null)

  if [ "$SUCCESS" = "true" ]; then
    echo ""
    echo "🎉 $STUDENTS_COUNT étudiants ont été assignés avec succès!"
    echo "📋 Training session: $SESSION_TITLE"
    echo ""
    echo "➡️  Les étudiants devraient maintenant apparaître dans le suivi en temps réel"
  else
    echo ""
    echo "ℹ️  Aucun étudiant actif trouvé pour cette date"
  fi
else
  echo "❌ Error: API call failed"
  echo ""
  echo "$HTTP_BODY"
fi

echo ""
echo "💡 Usage:"
echo "  $0                    # Use today's date"
echo "  $0 2025-11-04        # Specific date"
echo ""
echo "  TEACHER_EMAIL=autre@email.com $0    # Different teacher"
echo "  API_URL=http://localhost:5000 $0    # Local development"
