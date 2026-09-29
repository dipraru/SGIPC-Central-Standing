import cron from "node-cron";
import { Handle } from "../models/Handle.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { DailySolved } from "../models/DailySolved.js";
import { PendingProblem } from "../models/PendingProblem.js";
import {
  getSolvedProblems,
  getUserInfo,
  getLatestSubmissionTime,
  getUsersInfoBatch,
  getOrUpdateSolvedProblems,
} from "./codeforces.js";
import { toLocalDateKey, computeRatingUpTo, startOfLocalDayFromDateKey } from "./elo.js";

// 90 days in seconds — threshold for marking an account inactive
const INACTIVE_THRESHOLD_SECONDS = 90 * 24 * 3600;

// 3-day grace period before purging historical data after marking inactive
const INACTIVE_GRACE_DAYS = 3;

// Delay between handle refreshes to avoid CF rate-limiting (ms)
const HANDLE_REFRESH_DELAY_MS = 600;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Check if a handle has solved any problem in the last 90 days
// Gym problems also count — some members primarily compete on VJudge/gym
const hasRecentActivity = (solvedProblems) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cutoff = nowSeconds - INACTIVE_THRESHOLD_SECONDS;
  return solvedProblems.some(
    (p) => p.solvedAtSeconds && p.solvedAtSeconds >= cutoff
  );
};

// Function to refresh data for a single handle
export async function refreshHandleData(handle, options = {}) {
  const { fullHistory = false, forceActive = false, forceInactive = false, userInfo: preloadedUserInfo } = options;
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const localTodayKey = toLocalDateKey(nowSeconds);
    const localTodayStart = startOfLocalDayFromDateKey(localTodayKey);
    const targetEndSeconds = localTodayStart - 1;
    const targetDateKey = toLocalDateKey(targetEndSeconds);

    const handleDoc = await Handle.findOne({ handle });

    // ── Inactive Handle Optimization: only check once a week ─────────────────
    if (handleDoc?.isInactive && !forceActive) {
      const lastCheckTime = handleDoc.lastInactiveCheck
        ? new Date(handleDoc.lastInactiveCheck).getTime()
        : (handleDoc.inactiveSince ? new Date(handleDoc.inactiveSince).getTime() : 0);
      const daysSinceCheck = (Date.now() - lastCheckTime) / (1000 * 3600 * 24);

      // Skip if checked less than 7 days ago
      if (!forceInactive && daysSinceCheck < 7) {
        console.log(
          `Handle ${handle} is inactive (checked ${daysSinceCheck.toFixed(1)}d ago). Skipping weekly CF fetch.`
        );
        await HandleMeta.updateOne(
          { handle },
          { lastUpdateDate: targetDateKey }
        );
        return;
      }

      console.log(`Weekly activity check for inactive handle: ${handle}...`);
      const cutoff = nowSeconds - INACTIVE_THRESHOLD_SECONDS;
      let latestSubmissionTime = 0;
      try {
        latestSubmissionTime = await getLatestSubmissionTime(handle);
      } catch (err) {
        console.warn(`[Lightweight check failed for ${handle}]: ${err.message}`);
      }

      // If latest submission is older than 90 days, user is still inactive
      if (latestSubmissionTime > 0 && latestSubmissionTime < cutoff) {
        await Handle.updateOne(
          { handle },
          { lastInactiveCheck: new Date() }
        );
        await HandleMeta.updateOne(
          { handle },
          { lastUpdateDate: targetDateKey }
        );
        console.log(
          `Handle ${handle} verified still inactive (last solve ${new Date(latestSubmissionTime * 1000).toISOString().slice(0, 10)}).`
        );
        return;
      }

      console.log(
        `Handle ${handle} has recent activity (${latestSubmissionTime ? new Date(latestSubmissionTime * 1000).toISOString().slice(0, 10) : "unknown"})! Re-evaluating...`
      );
    }

    console.log(`Refreshing data for handle: ${handle}${preloadedUserInfo ? " (user.info from batch)" : ""}`);

    // Fetch user info and solved problems (supports preloaded batch user info and persistent MongoDB cache)
    const [userInfo, solvedRes] = await Promise.all([
      preloadedUserInfo ? Promise.resolve(preloadedUserInfo) : getUserInfo(handle),
      getOrUpdateSolvedProblems(handle, { forceFull: fullHistory }),
    ]);

    const solvedProblems = solvedRes.solvedList || [];
    const totalSolvedCount = solvedRes.totalSolvedCount || 0;

    // Deduplicate problems; treat Div1/Div2 mirrored problems as the same
    const areSameProblem = (a, b) => {
      if (Boolean(a.isGym) !== Boolean(b.isGym)) return false;
      const nameMatch = (a.name || "").toLowerCase() === (b.name || "").toLowerCase();
      const contestClose =
        Number.isFinite(a.contestId) &&
        Number.isFinite(b.contestId) &&
        Math.abs(a.contestId - b.contestId) <= 1;
      const sameIndex = a.index === b.index && a.contestId === b.contestId;
      return sameIndex || (nameMatch && contestClose);
    };

    const uniqueSolved = [];
    for (const problem of solvedProblems) {
      const existing = uniqueSolved.find((p) => areSameProblem(p, problem));
      if (!existing) {
        uniqueSolved.push(problem);
      } else if (
        problem.solvedAtSeconds &&
        (!existing.solvedAtSeconds || problem.solvedAtSeconds < existing.solvedAtSeconds)
      ) {
        Object.assign(existing, problem);
      }
    }

    // ── Inactive detection ────────────────────────────────────────────────────
    const active = forceActive || hasRecentActivity(uniqueSolved);

    if (!active) {
      // No activity in 90 days — mark as inactive
      if (handleDoc) {
        if (!handleDoc.isInactive) {
          // First time becoming inactive — set timestamp, don't purge yet
          await Handle.updateOne(
            { handle },
            { isInactive: true, inactiveSince: new Date(), lastInactiveCheck: new Date() }
          );
          console.log(`Handle ${handle} marked as inactive (no solves in 90 days).`);
        } else {
          // Already inactive — update lastInactiveCheck timestamp
          await Handle.updateOne(
            { handle },
            { lastInactiveCheck: new Date() }
          );
          const inactiveSince = handleDoc.inactiveSince
            ? new Date(handleDoc.inactiveSince)
            : new Date();
          const daysSinceInactive = Math.floor(
            (Date.now() - inactiveSince.getTime()) / (1000 * 3600 * 24)
          );

          if (daysSinceInactive >= INACTIVE_GRACE_DAYS) {
            // Grace period over — purge historical data to save storage
            await Promise.all([
              DailySolved.deleteMany({ handle }),
              RatingHistory.deleteMany({ handle }),
              PendingProblem.deleteMany({ handle }),
            ]);
            console.log(
              `Handle ${handle} historical data purged (inactive ${daysSinceInactive} days).`
            );
          } else {
            console.log(
              `Handle ${handle} is inactive but still within grace period (${daysSinceInactive}/${INACTIVE_GRACE_DAYS} days).`
            );
          }
        }

        // Keep HandleMeta updated with latest maxRating & totalSolved
        const finalTotalSolved = (handleDoc && Number.isFinite(handleDoc.customTotalSolved))
          ? handleDoc.customTotalSolved
          : totalSolvedCount;

        await HandleMeta.findOneAndUpdate(
          { handle },
          {
            handle,
            maxRating: userInfo.maxRating,
            totalSolved: finalTotalSolved,
            currentRating: 1000,
            lastUpdateDate: targetDateKey,
          },
          { upsert: true, new: true }
        );
      }
      return; // Stop here — no rating/daily data to refresh for inactive handle
    }

    // ── Active handle — re-activate if previously inactive or forceActive ──────
    if (handleDoc?.isInactive || forceActive) {
      await Handle.updateOne(
        { handle },
        { isInactive: false, inactiveSince: null, lastInactiveCheck: null }
      );
      console.log(`Handle ${handle} re-activated.`);
    }

    // ── Continue with normal data refresh ─────────────────────────────────────
    const existingMeta = await HandleMeta.findOne({ handle }).lean();
    const totalSolved = totalSolvedCount;

    const targetDayStart = startOfLocalDayFromDateKey(targetDateKey);
    const lastSixDates = Array.from({ length: 6 }, (_, i) =>
      toLocalDateKey(targetDayStart - (5 - i) * 86400)
    );
    const lastFiveDates = lastSixDates.slice(1);

    if (fullHistory) {
      await Promise.all([
        DailySolved.deleteMany({ handle }),
        RatingHistory.deleteMany({ handle }),
        PendingProblem.deleteMany({ handle }),
      ]);
    }

    const dailySolvedMap = new Map(lastFiveDates.map((dateKey) => [dateKey, []]));
    const pendingMap = new Map();

    for (const problem of uniqueSolved) {
      if (!problem.solvedAtSeconds || problem.isGym) {
        continue;
      }
      const dateKey = toLocalDateKey(problem.solvedAtSeconds);
      const daysAgo = Math.floor((targetEndSeconds - problem.solvedAtSeconds) / 86400);

      if (!problem.rating) {
        if (daysAgo <= 30) {
          pendingMap.set(`${problem.contestId}-${problem.index}`, {
            handle,
            date: dateKey,
            contestId: problem.contestId,
            index: problem.index,
            name: problem.name,
            solvedAtSeconds: problem.solvedAtSeconds,
          });
        }
        continue;
      }

      if (dailySolvedMap.has(dateKey)) {
        dailySolvedMap.get(dateKey).push({
          contestId: problem.contestId,
          index: problem.index,
          name: problem.name,
          rating: problem.rating,
        });
      }
    }

    await DailySolved.deleteMany({ handle, date: { $nin: lastFiveDates } });
    await Promise.all(
      lastFiveDates.map((dateKey) =>
        DailySolved.findOneAndUpdate(
          { handle, date: dateKey },
          { handle, date: dateKey, problems: dailySolvedMap.get(dateKey) || [] },
          { upsert: true, new: true }
        )
      )
    );

    await PendingProblem.deleteMany({ handle, date: { $lt: lastSixDates[0] } });
    await PendingProblem.deleteMany({ handle });
    if (pendingMap.size > 0) {
      await PendingProblem.insertMany(Array.from(pendingMap.values()));
    }

    let currentRating = 1000;
    const ratingResults = await Promise.all(
      lastSixDates.map(async (dateKey) => {
        const endSeconds = startOfLocalDayFromDateKey(dateKey) + 86400 - 1;
        const ratingForDate = computeRatingUpTo({
          maxRating: userInfo.maxRating,
          solvedProblems: uniqueSolved,
          dayEndSeconds: endSeconds,
        });
        const created = await RatingHistory.findOneAndUpdate(
          { handle, date: dateKey },
          { handle, date: dateKey, rating: ratingForDate },
          { upsert: true, new: true }
        ).lean();
        return [dateKey, created];
      })
    );
    const historyMap = new Map(ratingResults);
    currentRating = historyMap.get(targetDateKey)?.rating ?? 1000;

    const finalTotalSolved = (handleDoc && Number.isFinite(handleDoc.customTotalSolved))
      ? handleDoc.customTotalSolved
      : totalSolved;

    await HandleMeta.findOneAndUpdate(
      { handle },
      {
        handle,
        maxRating: userInfo.maxRating,
        totalSolved: finalTotalSolved,
        currentRating,
        lastUpdateDate: targetDateKey,
      },
      { upsert: true, new: true }
    );

    // Clean old data (keep last 6 days)
    const oldestKeptDate = lastSixDates[0];
    await Promise.all([
      DailySolved.deleteMany({ handle, date: { $lt: oldestKeptDate } }),
      RatingHistory.deleteMany({ handle, date: { $lt: oldestKeptDate } }),
      PendingProblem.deleteMany({ handle, date: { $lt: oldestKeptDate } }),
    ]);

    console.log(`Successfully refreshed data for handle: ${handle} (up to ${targetDateKey})${solvedRes?.cached ? " [cache hit]" : ""}`);
  } catch (error) {
    console.error(`Error refreshing handle ${handle}:`, error.message);
  }
}

// Refresh all handles, always including inactive ones so they can be
// re-activated automatically if they start solving again.
export async function refreshAllHandles(options = {}) {
  const { fullHistory = false } = options;
  console.log(
    `Starting refresh for all handles (fullHistory=${fullHistory ? "yes" : "no"})...`
  );

  // Always fetch every handle — refreshHandleData itself decides whether to
  // mark/unmark inactive based on hasRecentActivity.
  const allHandles = await Handle.find().select("handle isInactive").lean();

  console.log(`Refreshing ${allHandles.length} handles (inactive handles included for re-activation check)`);

  // Pre-fetch all user info in batches of 50
  const allHandleNames = allHandles.map((h) => h.handle);
  const userInfoMap = await getUsersInfoBatch(allHandleNames);

  for (const { handle } of allHandles) {
    const preloadedUserInfo = userInfoMap.get(handle.toLowerCase());
    await refreshHandleData(handle, { fullHistory, userInfo: preloadedUserInfo });
    // Throttle to avoid hitting Codeforces rate limits
    await delay(HANDLE_REFRESH_DELAY_MS);
  }

  console.log("Refresh completed for handles");
}

// Refresh a batch of handles that are outdated for the current target date.
// Designed for serverless environments (Vercel) to avoid function timeouts.
export async function refreshOutdatedHandlesChunk(options = {}) {
  const {
    limit = 6,
    maxDurationMs = 45000,
    fullHistory = false,
    skip,
  } = options;

  const startTime = Date.now();
  const nowSeconds = Math.floor(startTime / 1000);
  const localTodayKey = toLocalDateKey(nowSeconds);
  const localTodayStart = startOfLocalDayFromDateKey(localTodayKey);
  const targetEndSeconds = localTodayStart - 1;
  const targetDateKey = toLocalDateKey(targetEndSeconds);

  // If explicit skip is provided, use standard pagination (stable sort by _id)
  if (Number.isFinite(skip) && skip >= 0) {
    const total = await Handle.countDocuments();
    const handles = await Handle.find()
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const processed = [];
    for (const h of handles) {
      if (Date.now() - startTime >= maxDurationMs) {
        break;
      }
      await refreshHandleData(h.handle, { fullHistory });
      processed.push(h.handle);
      await delay(HANDLE_REFRESH_DELAY_MS);
    }

    return {
      status: "ok",
      processed,
      processedCount: processed.length,
      nextSkip: skip + handles.length,
      total,
      hasMore: skip + handles.length < total,
      targetDate: targetDateKey,
    };
  }

  // Automatic Queue Mode: Find handles that have NOT been updated up to targetDateKey
  const allHandles = await Handle.find().select("handle isInactive lastInactiveCheck inactiveSince").lean();
  const total = allHandles.length;

  const metas = await HandleMeta.find().select("handle lastUpdateDate updatedAt").lean();
  const metaMap = new Map(metas.map((m) => [m.handle, m]));

  // Auto-catchup inactive handles that were checked within the last 7 days:
  // Keep their lastUpdateDate current so they are only fetched once a week
  const inactiveToCatchUp = allHandles.filter((h) => {
    if (!h.isInactive) return false;
    const meta = metaMap.get(h.handle);
    if (meta && meta.lastUpdateDate === targetDateKey) return false;
    const lastCheckTime = h.lastInactiveCheck
      ? new Date(h.lastInactiveCheck).getTime()
      : (h.inactiveSince ? new Date(h.inactiveSince).getTime() : 0);
    const daysSinceCheck = (Date.now() - lastCheckTime) / (1000 * 3600 * 24);
    return daysSinceCheck < 7;
  });

  if (inactiveToCatchUp.length > 0) {
    await Promise.all(
      inactiveToCatchUp.map((h) =>
        HandleMeta.updateOne(
          { handle: h.handle },
          { lastUpdateDate: targetDateKey }
        )
      )
    );
  }

  const updatedMetas = await HandleMeta.find().select("handle lastUpdateDate updatedAt").lean();
  const updatedMetaMap = new Map(updatedMetas.map((m) => [m.handle, m]));

  // A handle is outdated if it has no HandleMeta entry OR lastUpdateDate !== targetDateKey
  const outdatedHandles = allHandles.filter((h) => {
    const meta = updatedMetaMap.get(h.handle);
    return !meta || meta.lastUpdateDate !== targetDateKey;
  });

  // Sort outdated handles so that handles never updated or updated longest ago come first
  outdatedHandles.sort((a, b) => {
    const metaA = updatedMetaMap.get(a.handle);
    const metaB = updatedMetaMap.get(b.handle);
    const timeA = metaA?.updatedAt ? new Date(metaA.updatedAt).getTime() : 0;
    const timeB = metaB?.updatedAt ? new Date(metaB.updatedAt).getTime() : 0;
    return timeA - timeB;
  });

  const candidateBatch = outdatedHandles.slice(0, limit);
  const candidateNames = candidateBatch.map((h) => h.handle);
  const userInfoMap = await getUsersInfoBatch(candidateNames);

  const processed = [];
  for (const h of outdatedHandles) {
    // Stop if limit reached or time budget exceeded
    if (processed.length >= limit || Date.now() - startTime >= maxDurationMs) {
      break;
    }

    const preloadedUserInfo = userInfoMap.get(h.handle.toLowerCase());
    await refreshHandleData(h.handle, { fullHistory, userInfo: preloadedUserInfo });
    processed.push(h.handle);
    await delay(HANDLE_REFRESH_DELAY_MS);
  }

  const remaining = Math.max(0, outdatedHandles.length - processed.length);

  return {
    status: "ok",
    processed,
    processedCount: processed.length,
    remaining,
    total,
    targetDate: targetDateKey,
  };
}

// Schedule daily refresh at midnight Bangladesh time (UTC+6 = 18:00 UTC)
export function startScheduler() {
  // Run once at server start to ensure data is fresh
  console.log("Running one-time refresh at server start...");
  refreshAllHandles().catch((error) =>
    console.error("One-time refresh failed:", error)
  );

  // Schedule cron job: midnight every day in Bangladesh time (UTC+6)
  // "0 18 * * *" = 18:00 UTC = 00:00 UTC+6
  cron.schedule("0 18 * * *", () => {
    console.log("[Cron] Midnight Bangladesh time — starting scheduled refresh...");
    refreshAllHandles().catch((error) =>
      console.error("[Cron] Scheduled refresh failed:", error)
    );
  }, {
    timezone: "UTC",
  });

  console.log(
    "Scheduler started: Daily refresh cron active at midnight Bangladesh time (18:00 UTC)"
  );
}
