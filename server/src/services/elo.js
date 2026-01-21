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

const getEloDelta = ({ current, opponent, maxRating, timeWeight }) => {
  const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
  const ratingMultiplier = getRatingMultiplier(opponent, maxRating);
  const k = opponent >= maxRating ? 32 : 12;
  return k * (1 - expected) * ratingMultiplier * timeWeight;
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
    const delta = getEloDelta({
      current,
      opponent,
      maxRating: safeMax,
      timeWeight,
    });
    current += delta;
  }

  return Math.round(current);
};

export const buildRecentStats = ({ maxRating, solvedProblems }) => {
  const safeMax = Number.isFinite(maxRating) ? maxRating : 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const startOfDaySeconds = (seconds) => Math.floor(seconds / 86400) * 86400;
  const recentDays = Array.from({ length: FIVE_DAYS }, (_, index) => {
    const daySeconds = nowSeconds - (FIVE_DAYS - 1 - index) * 86400;
    const dateKey = new Date(daySeconds * 1000).toISOString().slice(0, 10);
    return {
      date: dateKey,
      dayStartSeconds: startOfDaySeconds(daySeconds),
      problems: [],
      delta: 0,
      rating: 1000,
      fromRating: 1000,
      toRating: 1000,
    };
  });

  const dayMap = new Map(recentDays.map((day) => [day.date, day]));

  for (const problem of solvedProblems) {
    if (!problem.rating || !problem.solvedAtSeconds) {
      continue;
    }
    const daysAgo = daysBetween(problem.solvedAtSeconds, nowSeconds);
    if (daysAgo >= FIVE_DAYS || daysAgo < 0) {
      continue;
    }
    const dateKey = new Date(problem.solvedAtSeconds * 1000)
      .toISOString()
      .slice(0, 10);
    const dayBucket = dayMap.get(dateKey);
    if (!dayBucket) {
      continue;
    }
    dayBucket.problems.push({
      name: problem.name,
      rating: problem.rating,
      contestId: problem.contestId,
      index: problem.index,
      solvedAtSeconds: problem.solvedAtSeconds,
    });
  }

  const computeRatingForDay = (dayStartSeconds) => {
    const windowStart = dayStartSeconds - THIRTY_DAYS * 86400;
    const windowEnd = dayStartSeconds + 86400;
    const scoped = solvedProblems
      .filter(
        (problem) =>
          problem.rating &&
          problem.solvedAtSeconds &&
          problem.solvedAtSeconds >= windowStart &&
          problem.solvedAtSeconds < windowEnd
      )
      .sort((a, b) => a.solvedAtSeconds - b.solvedAtSeconds);

    let current = 1000;
    for (const problem of scoped) {
      const daysAgo = daysBetween(problem.solvedAtSeconds, dayStartSeconds);
      const timeWeight = getTimeWeight(daysAgo);
      if (timeWeight <= 0) {
        continue;
      }
      const delta = getEloDelta({
        current,
        opponent: problem.rating,
        maxRating: safeMax,
        timeWeight,
      });
      current += delta;
    }
    return Math.round(current);
  };

  for (const day of recentDays) {
    day.rating = computeRatingForDay(day.dayStartSeconds);
    day.problems = day.problems
      .sort((a, b) => a.solvedAtSeconds - b.solvedAtSeconds)
      .map(({ solvedAtSeconds, ...rest }) => rest);
  }

  for (let i = 0; i < recentDays.length; i += 1) {
    const today = recentDays[i];
    const fromRating =
      i === 0
        ? computeRatingForDay(today.dayStartSeconds - 86400)
        : recentDays[i - 1].rating;
    const toRating = today.rating;
    today.fromRating = fromRating;
    today.toRating = toRating;
    today.delta = toRating - fromRating;
  }

  return recentDays
    .reverse()
    .map(({ dayStartSeconds, rating, ...rest }) => rest);
};
