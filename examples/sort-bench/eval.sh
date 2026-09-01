#!/bin/bash
set -euo pipefail
SOLUTION="${1:-./solution}"
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/task/input.txt" ]; then
  INPUT="$HERE/task/input.txt"
  EXPECTED="$HERE/task/expected.txt"
else
  INPUT="$HERE/input.txt"
  EXPECTED="$HERE/expected.txt"
fi
OUT="$(mktemp)"
START="$(date +%s%N)"
bash "$SOLUTION/solve.sh" < "$INPUT" > "$OUT"
END="$(date +%s%N)"
MS=$(( (END - START) / 1000000 ))
if ! diff -q "$EXPECTED" "$OUT" >/dev/null; then
  echo "output mismatch" >&2
  diff -u "$EXPECTED" "$OUT" >&2 || true
  exit 1
fi
SCORE=$(( 1000000 / (MS + 1) ))
printf '{"score":%s,"higher_is_better":true,"notes":"%sms"}\n' "$SCORE" "$MS" > score.json
echo "score $SCORE (${MS}ms)"
