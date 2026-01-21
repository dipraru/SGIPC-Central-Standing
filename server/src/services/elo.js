const FIVE_DAYS = 5;
const THIRTY_DAYS = 30;

const daysBetween = (fromSeconds, toSeconds) =>
  Math.floor((toSeconds - fromSeconds) / 86400);

const getTimeWeight = (daysAgo) => {
  if (daysAgo <= FIVE_DAYS) {
    return 1;
  }
  if (daysAgo > THIRTY_DAYS) {
    return 0;
  }
  const remaining = THIRTY_DAYS - daysAgo;
  return Math.max(remaining / (THIRTY_DAYS - FIVE_DAYS), 0);
};

const getRatingMultiplier = (problemRating, maxRating) => {
  if (problemRating >= maxRating) {
    return 1 + Math.min((problemRating - maxRating) / 1000, 1);
  }

  const diff = Math.min((maxRating - problemRating) / 1000, 1);
  return 0.3 + (1 - diff) * 0.4;
};

export const calculateEloScore = ({ maxRating, solvedProblems }) => {
  let current = 1000;
  const safeMax = Number.isFinite(maxRating) ? maxRating : 0;
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const problem of solvedProblems) {
    if (!problem.rating || !problem.solvedAtSeconds) {
      continue;
    }

    const daysAgo = daysBetween(problem.solvedAtSeconds, nowSeconds);
    const timeWeight = getTimeWeight(daysAgo);
    if (timeWeight <= 0) {
      continue;
    }

    const opponent = problem.rating;
    const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
    const ratingMultiplier = getRatingMultiplier(opponent, safeMax);
    const k = opponent >= safeMax ? 32 : 12;
    const delta = k * (1 - expected) * ratingMultiplier * timeWeight;
    current += delta;
  }

  return Math.round(current);
};
