// Levenshtein distance — catches typosquatted package names
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Names this short are within 2 edits of lots of unrelated packages
// (tsx → nx, ws, tar), so only a 1-character difference counts for them.
const SHORT_NAME = 4;

export function isSuspiciousName(name, popularPackages, threshold = 2) {
  const suspects = [];
  for (const known of popularPackages) {
    if (name === known) continue;
    const limit = Math.min(name.length, known.length) <= SHORT_NAME ? Math.min(threshold, 1) : threshold;
    const dist = levenshtein(name, known);
    if (dist > 0 && dist <= limit) {
      suspects.push({ known, distance: dist });
    }
  }
  return suspects;
}
