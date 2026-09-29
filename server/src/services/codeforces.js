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

// Fetch recent submissions up to count (default 50)
export const getRecentSubmissions = async (handle, count = 50) => {
  return withRetry(async () => {
    const { data } = await client.get("/user.status", {
      params: { handle, from: 1, count },
    });

    if (data.status !== "OK") {
      throw new Error(`Unable to fetch recent submissions for ${handle}`);
    }

    return data.result || [];
  });
};

// Cached & Incremental solved problems:
// 1. If latest submission matches MongoDB cache: instantaneous 0-fetch cache hit (~150ms)
// 2. If user made <= 50 new submissions: incremental update via single 50-item fetch (~250ms)
// 3. Fallback to full fetch only on initial seeding or >50 submissions since last check
export const getOrUpdateSolvedProblems = async (handle, options = {}) => {
  const { forceFull = false } = options;

  // 1. Check persistent cache in MongoDB
  const cachedDoc = await HandleSolves.findOne({ handle }).lean();

  // If no cache exists, or forceFull requested, perform initial full fetch
  if (forceFull || !cachedDoc || !cachedDoc.lastSubmissionId) {
    console.log(`[CF API] ${handle}: performing initial full fetch of submissions...`);
    const solvedRes = await getSolvedProblems(handle);
    let latestId = 0;
    let latestTime = 0;
    try {
      const probe = await getLatestSubmission(handle);
      if (probe) {
        latestId = probe.id;
        latestTime = probe.creationTimeSeconds;
      }
    } catch (_) {}

    const newSubId = latestId || (solvedRes.solvedList[0]?.solvedAtSeconds ? 1 : 0);

    await HandleSolves.findOneAndUpdate(
      { handle },
      {
        handle,
        lastSubmissionId: newSubId,
        lastSubmissionTime: latestTime,
        totalSolvedCount: solvedRes.totalSolvedCount,
        solvedList: solvedRes.solvedList,
      },
      { upsert: true, new: true }
    );

    return {
      ...solvedRes,
      cached: false,
      lastSubmissionId: newSubId,
    };
  }

  // 2. Fetch the most recent 50 submissions (lightweight ~10-20KB vs 5-15MB full history)
  let recentSubs = [];
  try {
    recentSubs = await getRecentSubmissions(handle, 50);
  } catch (err) {
    console.warn(`[CF API] Recent submissions fetch failed for ${handle}: ${err.message}`);
    // If network fails, return cached data gracefully
    return {
      solvedList: cachedDoc.solvedList || [],
      totalSolvedCount: cachedDoc.totalSolvedCount || 0,
      cached: true,
      lastSubmissionId: cachedDoc.lastSubmissionId,
    };
  }

  if (recentSubs.length === 0) {
    return {
      solvedList: cachedDoc.solvedList || [],
      totalSolvedCount: cachedDoc.totalSolvedCount || 0,
      cached: true,
      lastSubmissionId: cachedDoc.lastSubmissionId,
    };
  }

  const latestSub = recentSubs[0];

  // 3. Exact cache hit: latest submission ID matches cache
  if (latestSub.id === cachedDoc.lastSubmissionId) {
    console.log(`[Cache Hit] ${handle}: 0 new CF submissions (reusing ${cachedDoc.totalSolvedCount} cached solves)`);
    return {
      solvedList: cachedDoc.solvedList || [],
      totalSolvedCount: cachedDoc.totalSolvedCount || 0,
      cached: true,
      lastSubmissionId: cachedDoc.lastSubmissionId,
    };
  }

  // 4. Incremental update: check if previous lastSubmissionId is within the recent 50
  const prevIndex = recentSubs.findIndex((s) => s.id === cachedDoc.lastSubmissionId);

  if (prevIndex !== -1) {
    // All new submissions since last check are in recentSubs[0 ... prevIndex - 1]
    const newSubs = recentSubs.slice(0, prevIndex);
    console.log(
      `[Incremental Sync] ${handle}: ${newSubs.length} new submissions since last sync (ID ${cachedDoc.lastSubmissionId} -> ${latestSub.id})`
    );

    // Build existing solves map
    const solvedMap = new Map();
    for (const p of cachedDoc.solvedList || []) {
      const key = p.isGym ? `gym-${p.contestId}-${p.index}` : `${p.contestId}-${p.index}`;
      solvedMap.set(key, p);
    }

    let newSolvesCount = 0;
    // Process new submissions from oldest to newest
    for (let i = newSubs.length - 1; i >= 0; i--) {
      const sub = newSubs[i];
      if (sub.verdict !== "OK" || !sub.problem) continue;

      const problem = sub.problem;
      const problemsetName = problem.problemsetName;
      const contestId = problem.contestId;
      const isGym =
        problemsetName === "gym" ||
        (Number.isFinite(contestId) && contestId >= 100000);

      const key = isGym
        ? `gym-${contestId}-${problem.index}`
        : `${contestId}-${problem.index}`;

      if (!solvedMap.has(key)) {
        newSolvesCount++;
        solvedMap.set(key, {
          name: problem.name,
          rating: problem.rating ?? null,
          contestId: problem.contestId,
          index: problem.index,
          solvedAtSeconds: sub.creationTimeSeconds,
          isRated: Boolean(problem.rating),
          isGym: Boolean(isGym),
        });
      }
    }

    const updatedSolvedList = Array.from(solvedMap.values());
    const updatedTotalCount = (cachedDoc.totalSolvedCount || 0) + newSolvesCount;

    await HandleSolves.findOneAndUpdate(
      { handle },
      {
        handle,
        lastSubmissionId: latestSub.id,
        lastSubmissionTime: latestSub.creationTimeSeconds || 0,
        totalSolvedCount: updatedTotalCount,
        solvedList: updatedSolvedList,
      },
      { upsert: true, new: true }
    );

    return {
      solvedList: updatedSolvedList,
      totalSolvedCount: updatedTotalCount,
      cached: false,
      lastSubmissionId: latestSub.id,
      incremental: true,
    };
  }

  // 5. Fallback: if user made >50 submissions since last check, perform full fetch
  console.log(`[CF API] ${handle}: >50 submissions since last check, performing full fetch...`);
  const fullRes = await getSolvedProblems(handle);
  await HandleSolves.findOneAndUpdate(
    { handle },
    {
      handle,
      lastSubmissionId: latestSub.id,
      lastSubmissionTime: latestSub.creationTimeSeconds || 0,
      totalSolvedCount: fullRes.totalSolvedCount,
      solvedList: fullRes.solvedList,
    },
    { upsert: true, new: true }
  );

  return {
    ...fullRes,
    cached: false,
    lastSubmissionId: latestSub.id,
  };
};

