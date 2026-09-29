import axios from "axios";
import { HandleSolves } from "../models/HandleSolves.js";

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

// Batch fetch user info for multiple handles in a single API call (up to 50 per chunk)
export const getUsersInfoBatch = async (handles = []) => {
  if (!handles || handles.length === 0) return new Map();
  const CHUNK_SIZE = 50;
  const resultMap = new Map();
  const totalChunks = Math.ceil(handles.length / CHUNK_SIZE);
  console.log(`[CF API] Batch-fetching user.info for ${handles.length} handles in ${totalChunks} API call(s)...`);

  for (let i = 0; i < handles.length; i += CHUNK_SIZE) {
    const chunk = handles.slice(i, i + CHUNK_SIZE);
    try {
      const data = await withRetry(async () => {
        const res = await client.get("/user.info", {
          params: { handles: chunk.join(";") },
        });
        return res.data;
      });

      if (data.status === "OK" && Array.isArray(data.result)) {
        for (const user of data.result) {
          resultMap.set(user.handle.toLowerCase(), {
            handle: user.handle,
            maxRating: user.maxRating ?? user.rating ?? 0,
            rating: user.rating ?? 0,
            rank: user.rank ?? "unrated",
          });
        }
      }
    } catch (err) {
      console.warn(`[CF API] Batch user.info failed for chunk: ${err.message}`);
    }
  }

  console.log(`[CF API] Batch fetch complete: loaded profile info for ${resultMap.size}/${handles.length} handles.`);
  return resultMap;
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
    const allSolvedSet = new Set();

    for (const submission of data.result) {
      if (submission.verdict !== "OK" || !submission.problem) {
        continue;
      }
      const problem = submission.problem;
      const problemsetName = problem.problemsetName;
      const contestId = problem.contestId;
      const isGym =
        problemsetName === "gym" ||
        (Number.isFinite(contestId) && contestId >= 100000);

      // Key for total solved count (every unique problem on Codeforces)
      const globalKey = contestId && problem.index
        ? `${problemsetName || "cf"}-${contestId}-${problem.index}`
        : `${problemsetName || "cf"}-${problem.name}`;
      allSolvedSet.add(globalKey);

      const key = isGym
        ? `gym-${contestId}-${problem.index}`
        : `${contestId}-${problem.index}`;
      const solvedAtSeconds = submission.creationTimeSeconds;
      if (!solved.has(key)) {
        solved.set(key, {
          name: problem.name,
          rating: problem.rating ?? null,
          contestId: problem.contestId,
          index: problem.index,
          solvedAtSeconds,
          isRated: Boolean(problem.rating),
          isGym: Boolean(isGym),
        });
      } else {
        const existing = solved.get(key);
        if (solvedAtSeconds && solvedAtSeconds < existing.solvedAtSeconds) {
          solved.set(key, { ...existing, solvedAtSeconds });
        }
      }
    }

    return {
      solvedList: Array.from(solved.values()),
      totalSolvedCount: allSolvedSet.size,
    };
  });
};

// Fast lightweight check for latest submission timestamp (from=1&count=1)
// Avoids downloading thousands of past submissions when checking inactive accounts
export const getLatestSubmissionTime = async (handle) => {
  const sub = await getLatestSubmission(handle);
  return sub ? sub.creationTimeSeconds : 0;
};

// Fast lightweight check for latest submission object (id + creationTimeSeconds)
export const getLatestSubmission = async (handle) => {
  return withRetry(async () => {
    const { data } = await client.get("/user.status", {
      params: { handle, from: 1, count: 1 },
    });

    if (data.status !== "OK") {
      throw new Error("Unable to fetch latest submission");
    }

    if (!data.result || data.result.length === 0) {
      return null;
    }

    const sub = data.result[0];
    return {
      id: sub.id,
      creationTimeSeconds: sub.creationTimeSeconds || 0,
    };
  });
};

// Cached solved problems: uses MongoDB HandleSolves cache when no new submissions occurred
export const getOrUpdateSolvedProblems = async (handle, options = {}) => {
  const { forceFull = false } = options;

  let latestSub = null;
  try {
    latestSub = await getLatestSubmission(handle);
  } catch (err) {
    console.warn(`[CF API] Latest submission probe failed for ${handle}: ${err.message}`);
  }

  // Check persistent cache in MongoDB
  const cachedDoc = await HandleSolves.findOne({ handle }).lean();

  if (
    !forceFull &&
    cachedDoc &&
    cachedDoc.lastSubmissionId &&
    latestSub &&
    cachedDoc.lastSubmissionId === latestSub.id
  ) {
    console.log(`[Cache Hit] ${handle}: 0 new CF submissions (reusing ${cachedDoc.totalSolvedCount} cached solves)`);
    return {
      solvedList: cachedDoc.solvedList || [],
      totalSolvedCount: cachedDoc.totalSolvedCount || 0,
      cached: true,
      lastSubmissionId: cachedDoc.lastSubmissionId,
    };
  }

  // Full fetch and cache update in MongoDB
  console.log(`[CF API] ${handle}: fetching fresh submissions from Codeforces (updating cache)...`);
  const solvedRes = await getSolvedProblems(handle);
  const newSubmissionId = latestSub?.id || (solvedRes.solvedList[0]?.solvedAtSeconds ? 1 : 0);
  const newSubmissionTime = latestSub?.creationTimeSeconds || 0;

  await HandleSolves.findOneAndUpdate(
    { handle },
    {
      handle,
      lastSubmissionId: newSubmissionId,
      lastSubmissionTime: newSubmissionTime,
      totalSolvedCount: solvedRes.totalSolvedCount,
      solvedList: solvedRes.solvedList,
    },
    { upsert: true, new: true }
  );

  return {
    ...solvedRes,
    cached: false,
    lastSubmissionId: newSubmissionId,
  };
};

