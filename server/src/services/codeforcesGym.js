import axios from "axios";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { GymContest } from "../models/GymContest.js";
import { classifyContestSolves } from "./contestClassifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PY_SCRAPER_PATH = path.resolve(__dirname, "../scripts/fetch_gym_problems.py");

const CF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

let isSyncingNewer = false;

/**
 * Scrapes the gym problem table directly from https://codeforces.com/gym/{contestId}
 * using Python + curl_cffi with Chrome impersonation.
 * This guarantees capturing problems that have 0 submissions or were skipped in API.
 */
async function scrapeGymProblemsFromWeb(contestId) {
  return new Promise((resolve) => {
    try {
      const py = spawn("python3", [PY_SCRAPER_PATH, String(contestId)]);
      let stdout = "";
      let stderr = "";
      py.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      py.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      py.on("close", (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim());
            if (data.status === "OK" && Array.isArray(data.problems) && data.problems.length > 0) {
              return resolve(data.problems);
            }
          } catch (e) {
            console.warn(`JSON parse error scraping contest ${contestId}:`, e.message);
          }
        }
        resolve([]);
      });
      py.on("error", (err) => {
        console.warn(`Python spawn error scraping contest ${contestId}:`, err.message);
        resolve([]);
      });
      setTimeout(() => {
        try {
          py.kill();
        } catch (e) {}
        resolve([]);
      }, 15000);
    } catch (err) {
      resolve([]);
    }
  });
}

/**
 * Fetch problem stats for a single Gym contest via Codeforces API + Web Scraper merge
 */
export async function fetchContestProblemStats(contestId) {
  const url = `https://codeforces.com/api/contest.status?contestId=${contestId}&from=1&count=100000`;

  try {
    // Run web scrape (for authoritative problem list) and CF contest.status API (for solves/authors) in parallel
    const [webResult, apiResult] = await Promise.allSettled([
      scrapeGymProblemsFromWeb(contestId),
      axios.get(url, { headers: CF_HEADERS, timeout: 25000 }),
    ]);

    const problemsMap = new Map();

    // 1. Ingest problems from Web Scraper (captures 0-submission problems like Problem I)
    if (webResult.status === "fulfilled" && Array.isArray(webResult.value) && webResult.value.length > 0) {
      for (const wp of webResult.value) {
        const idx = String(wp.problemIndex || "").trim().toUpperCase();
        if (!idx) continue;
        problemsMap.set(idx, {
          problemIndex: idx,
          name: wp.name || `Problem ${idx}`,
          contestSolves: 0,
          allTimeSolves: Number(wp.allTimeSolves) || 0,
        });
      }
    }

    // 2. Ingest / merge solves from contest.status API
    const apiContestSolves = new Map();
    const apiAllTimeSolves = new Map();

    if (apiResult.status === "fulfilled" && apiResult.value.data?.status === "OK") {
      const subs = apiResult.value.data.result || [];
      const contestSolved = new Set();
      const allTimeSolved = new Set();

      for (const s of subs) {
        const prob = s.problem;
        if (!prob || !prob.index) continue;
        const idx = String(prob.index).trim().toUpperCase();

        if (!problemsMap.has(idx)) {
          problemsMap.set(idx, {
            problemIndex: idx,
            name: prob.name || `Problem ${idx}`,
            contestSolves: 0,
            allTimeSolves: 0,
          });
        } else {
          // If problem has generic name, update with API problem name
          const current = problemsMap.get(idx);
          if (prob.name && (!current.name || current.name === `Problem ${idx}` || current.name === idx)) {
            current.name = prob.name;
          }
        }

        if (s.verdict === "OK") {
          const author = s.author || {};
          const isContestant =
            author.ghost === true || author.participantType === "CONTESTANT";
          const userKey =
            author.participantId ||
            author.teamName ||
            (author.members && author.members.length > 0
              ? author.members.map((m) => m.handle).sort().join(",")
              : null) ||
            `sub_${s.id}`;

          const contestKey = `${idx}::${userKey}`;
          if (!allTimeSolved.has(contestKey)) {
            allTimeSolved.add(contestKey);
            apiAllTimeSolves.set(idx, (apiAllTimeSolves.get(idx) || 0) + 1);
          }

          if (isContestant && !contestSolved.has(contestKey)) {
            contestSolved.add(contestKey);
            apiContestSolves.set(idx, (apiContestSolves.get(idx) || 0) + 1);
          }
        }
      }
    }

    // 3. Reconcile solve counts for each problem
    for (const [idx, prob] of problemsMap.entries()) {
      const contestCnt = apiContestSolves.get(idx) || 0;
      const apiAllTimeCnt = apiAllTimeSolves.get(idx) || 0;
      prob.contestSolves = contestCnt;
      prob.allTimeSolves = Math.max(prob.allTimeSolves || 0, apiAllTimeCnt, contestCnt);
    }

    // Sort problems by index (A, B, C... AA, AB...)
    const sortedProblems = Array.from(problemsMap.values()).sort((a, b) => {
      if (a.problemIndex.length !== b.problemIndex.length) {
        return a.problemIndex.length - b.problemIndex.length;
      }
      return a.problemIndex.localeCompare(b.problemIndex);
    });

    const totalContest = sortedProblems.reduce(
      (acc, p) => acc + (p.contestSolves || 0),
      0
    );
    const totalAllTime = sortedProblems.reduce(
      (acc, p) => acc + (p.allTimeSolves || 0),
      0
    );

    let catSolves = sortedProblems.map((p) => p.allTimeSolves);
    if (!catSolves.length || catSolves.reduce((a, b) => a + b, 0) === 0) {
      catSolves = sortedProblems.map((p) => p.contestSolves);
    }

    const classification = classifyContestSolves(catSolves);

    const updated = await GymContest.findOneAndUpdate(
      { id: contestId },
      {
        $set: {
          hasProblemData: true,
          fetchedAt: new Date(),
          problemsCount: sortedProblems.length,
          totalContestSolves: totalContest,
          totalAllTimeSolves: totalAllTime,
          problems: sortedProblems,
          category: classification.category,
          categoryScores: classification.scores,
          categoryExplanation: classification.explanation,
        },
      },
      { new: true }
    );

    return {
      status: "OK",
      contest: updated,
    };
  } catch (err) {
    console.error(`Failed to fetch problem stats for contest ${contestId}:`, err.message);
    throw err;
  }
}

/**
 * Fetch latest gym contests list from Codeforces API and insert any new ones,
 * and ensure problem statistics are fetched and cached for pending contests.
 */
export async function fetchNewerGymContests() {
  if (isSyncingNewer) {
    return {
      status: "BUSY",
      message: "Sync newer contests is already in progress.",
    };
  }

  isSyncingNewer = true;
  const safetyTimer = setTimeout(() => {
    isSyncingNewer = false;
  }, 120000);

  try {
    const url = "https://codeforces.com/api/contest.list?gym=true";
    const resp = await axios.get(url, { headers: CF_HEADERS, timeout: 65000 });
    if (resp.data?.status !== "OK") {
      throw new Error(
        resp.data?.comment || `CF API status: ${resp.data?.status}`
      );
    }

    const apiContests = resp.data.result || [];
    const existingIds = new Set(await GymContest.distinct("id"));
    const newContests = apiContests.filter((c) => !existingIds.has(c.id));

    let insertedCount = 0;
    if (newContests.length > 0) {
      const docsToInsert = newContests.map((c) => ({
        id: c.id,
        name: c.name || `Gym Contest ${c.id}`,
        type: c.type || "ICPC",
        phase: c.phase || "FINISHED",
        durationSeconds: c.durationSeconds || 0,
        startTimeSeconds: c.startTimeSeconds || 0,
        difficulty: c.difficulty || 0,
        kind: c.kind || "",
        season: c.season || "",
        city: c.city || null,
        websiteUrl: c.websiteUrl || null,
        problemsCount: 0,
        totalContestSolves: 0,
        totalAllTimeSolves: 0,
        hasProblemData: false,
        isDone: false,
        category: "standard",
        categoryScores: { standard: 0.6, spike: 0.2, equilibrium: 0.2 },
        categoryExplanation: "Pending problem data analysis",
        problems: [],
        rawJson: c,
      }));

      await GymContest.insertMany(docsToInsert, { ordered: false });
      insertedCount = docsToInsert.length;
    }

    // Identify recent contests that are missing problem statistics (including newly inserted ones)
    const pendingContests = await GymContest.find({ hasProblemData: false })
      .sort({ startTimeSeconds: -1, id: -1 })
      .limit(10)
      .select("id name");

    let fetchedCount = 0;
    for (const item of pendingContests) {
      try {
        await fetchContestProblemStats(item.id);
        fetchedCount++;
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        console.warn(`Auto-fetch stats failed for contest ${item.id}:`, e.message);
      }
    }

    const totalNow = await GymContest.countDocuments();
    let message = "";
    if (insertedCount > 0 && fetchedCount > 0) {
      message = `Ingested ${insertedCount} new contest(s) and synced problems for ${fetchedCount} contest(s).`;
    } else if (insertedCount > 0) {
      message = `Ingested ${insertedCount} new gym contest(s).`;
    } else if (fetchedCount > 0) {
      message = `All contests up to date. Synchronized problems for ${fetchedCount} contest(s).`;
    } else {
      message = "All Gym contests and problem statistics are completely up to date!";
    }

    return {
      status: "OK",
      newCount: insertedCount,
      fetchedCount,
      totalContests: totalNow,
      message,
    };
  } finally {
    clearTimeout(safetyTimer);
    isSyncingNewer = false;
  }
}
