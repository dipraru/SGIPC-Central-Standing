import axios from "axios";

const client = axios.create({
  baseURL: "https://codeforces.com/api",
  timeout: 20000,
});

// Retry with exponential backoff for rate-limit / transient errors
const withRetry = async (fn, retries = 3, baseDelayMs = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err?.response?.status === 429;
      const isServerError = err?.response?.status >= 500;
      const isTimeout = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";

      if ((isRateLimit || isServerError || isTimeout) && attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[CF API] Attempt ${attempt} failed (${err?.response?.status ?? err.code}). Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
};

export const getUserInfo = async (handle) => {
  return withRetry(async () => {
    const { data } = await client.get("/user.info", {
      params: { handles: handle },
    });

    if (data.status !== "OK" || !data.result?.length) {
      throw new Error("Codeforces user not found");
    }

    const info = data.result[0];
    return {
      handle: info.handle,
      maxRating: info.maxRating ?? info.rating ?? 0,
    };
  });
};

export const getSolvedProblems = async (handle) => {
  return withRetry(async () => {
    const { data } = await client.get("/user.status", {
      params: { handle },
    });

    if (data.status !== "OK") {
      throw new Error("Unable to fetch submissions");
    }

    const solved = new Map();
    for (const submission of data.result) {
      if (submission.verdict !== "OK") {
        continue;
      }
      const problemsetName = submission.problem?.problemsetName;
      const contestId = submission.problem?.contestId;
      const isGym =
        problemsetName === "gym" ||
        (Number.isFinite(contestId) && contestId >= 100000);
      if (isGym) {
        continue;
      }
      const problem = submission.problem;
      const key = `${problem.contestId}-${problem.index}`;
      const solvedAtSeconds = submission.creationTimeSeconds;
      if (!solved.has(key)) {
        solved.set(key, {
          name: problem.name,
          rating: problem.rating ?? null,
          contestId: problem.contestId,
          index: problem.index,
          solvedAtSeconds,
          isRated: Boolean(problem.rating),
          isGym,
        });
      } else {
        const existing = solved.get(key);
        if (solvedAtSeconds && solvedAtSeconds < existing.solvedAtSeconds) {
          solved.set(key, { ...existing, solvedAtSeconds });
        }
      }
    }

    return Array.from(solved.values());
  });
};
