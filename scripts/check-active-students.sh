#!/bin/bash

# Quick check: How many students are currently active?
# This script directly queries Supabase to show active students for today

SESSION_DATE="${1:-$(date +%Y-%m-%d)}"
START_TIME="${SESSION_DATE}T00:00:00Z"
END_TIME="${SESSION_DATE}T23:59:59Z"

echo "🔍 Checking active students for date: $SESSION_DATE"
echo "⏰ Time range: $START_TIME to $END_TIME"
echo ""
echo "📝 To execute this check in Supabase SQL Editor, run:"
echo ""
echo "════════════════════════════════════════════════════════════════"
cat <<'SQL'
-- Active students query
SELECT
  s.student_email,
  s.scenario_id,
  s.session_id,
  s.start_time,
  COUNT(e.id) as message_count,
  COALESCE(
    (SELECT COUNT(*)
     FROM student_progress_snapshots sps
     WHERE sps.session_id = s.id),
    0
  ) as snapshot_count
FROM sessions s
LEFT JOIN exchanges e ON s.id = e.session_id
WHERE s.start_time >= '${START_TIME}'
  AND s.start_time <= '${END_TIME}'
GROUP BY s.id, s.student_email, s.scenario_id, s.session_id, s.start_time
ORDER BY s.start_time DESC;
SQL
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "💡 Quick summary query:"
echo ""
cat <<'SQL'
-- Quick count
SELECT
  COUNT(DISTINCT student_email) as unique_students,
  COUNT(*) as total_sessions,
  AVG(message_count) as avg_messages
FROM (
  SELECT s.student_email, COUNT(e.id) as message_count
  FROM sessions s
  LEFT JOIN exchanges e ON s.id = e.session_id
  WHERE s.start_time >= '${START_TIME}'
    AND s.start_time <= '${END_TIME}'
  GROUP BY s.student_email, s.id
) sub;
SQL
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🎯 Expected result:"
echo "  - List of student emails with their sessions"
echo "  - message_count: how many messages they've sent"
echo "  - snapshot_count: whether snapshots were created (needed for visibility)"
echo ""
echo "❌ If snapshot_count = 0 despite message_count > 2:"
echo "   → Snapshots are not being created properly"
echo "   → Check Vercel logs for 'analyzeSessionProgress' errors"
echo ""
echo "✅ If snapshot_count > 0:"
echo "   → Snapshots exist, students SHOULD be visible"
echo "   → If still not visible, run: ./assign-active-students.sh"
