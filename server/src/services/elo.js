export const calculateEloScore = ({ maxRating, solvedProblems }) => {
  let current = 1000;
  const safeMax = Number.isFinite(maxRating) ? maxRating : 0;

  for (const problem of solvedProblems) {
    if (!problem.rating) {
      continue;
    }

    const opponent = problem.rating;
    const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
    const higherOrEqual = opponent >= safeMax;
    const k = higherOrEqual ? 32 : 8;
    const multiplier = higherOrEqual
      ? 1 + Math.min((opponent - safeMax) / 1000, 1)
      : 0.5;

    const delta = k * (1 - expected) * multiplier;
    current += delta;
  }

  return Math.round(current);
};
