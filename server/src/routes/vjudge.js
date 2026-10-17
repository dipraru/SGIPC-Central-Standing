import express from "express";
import { VjudgeContest } from "../models/VjudgeContest.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { VjudgeConfig } from "../models/VjudgeConfig.js";
import {
  buildBiscuitStandings,
  buildEloStandings,
  buildTeamGroups,
  fetchContestRank,
  syncContestRank,
} from "../services/vjudge.js";

const router = express.Router();

router.get("/vjudge/standings", async (req, res) => {
  const contests = await VjudgeContest.find({ enabled: true }).lean();
  const teams = await VjudgeTeam.find().lean();
  const errors = [];

  if (!contests.length || !teams.length) {
    return res.json({
      contests: [],
      teams: [],
      standings: [],
      standingsByType: {
        normal: [],
        biscuit: [],
        "gain-only": [],
        "zero-participation": [],
      },
      errors: [],
    });
  }

  const contestPayloads = await Promise.all(
    contests.map(async (contest) => {
      try {
        if (contest.ranklist && Array.isArray(contest.ranklist) && contest.ranklist.length > 0) {
          const ageMs = contest.lastFetchedAt
            ? Date.now() - new Date(contest.lastFetchedAt).getTime()
            : Infinity;

          if (ageMs > 15 * 60 * 1000) {
            try {
              const fresh = await syncContestRank(VjudgeContest, contest);
              if (fresh && !fresh.error && fresh.ranklist) {
                return {
                  ...fresh,
                  contestId: contest.contestId,
                  beginTime: fresh.beginTime || contest.beginTime || contest.createdAt,
                  createdAt: contest.createdAt,
                };
              }
            } catch (e) {}
          }

          return {
            contestId: contest.contestId,
            title: contest.title || `Contest #${contest.contestId}`,
            ranklist: contest.ranklist,
            participants: contest.participants || {},
            beginTime: contest.beginTime || contest.createdAt,
            createdAt: contest.createdAt,
          };
        }

        const data = await syncContestRank(VjudgeContest, contest);
        if (data.error) {
          errors.push({ contestId: contest.contestId, message: data.error });
          return null;
        }
        return {
          ...data,
          contestId: contest.contestId,
          beginTime: data.beginTime || contest.beginTime || contest.createdAt,
          createdAt: contest.createdAt,
        };
      } catch (error) {
        if (contest.ranklist && Array.isArray(contest.ranklist) && contest.ranklist.length > 0) {
          return {
            contestId: contest.contestId,
            title: contest.title || `Contest #${contest.contestId}`,
            ranklist: contest.ranklist,
            participants: contest.participants || {},
            beginTime: contest.beginTime || contest.createdAt,
            createdAt: contest.createdAt,
          };
        }
        return null;
      }
    })
  );

  const validContests = contestPayloads
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = new Date(a.beginTime || a.createdAt || 0).getTime();
      const timeB = new Date(b.beginTime || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.contestId) - Number(b.contestId);
    });
  const teamGroups = buildTeamGroups(teams);
  const teamById = new Map(teams.map((t) => [t._id.toString(), t]));

  const enrich = (rows) =>
    rows.map((row) => {
      const dbTeam = teamById.get(row.id);
      return {
        ...row,
        aliases: dbTeam?.aliases || [],
        members: dbTeam?.members || [],
      };
    });

  // Calculate ratings using the Biscuit Rating system (45-day window)
  const biscuitStandings = enrich(buildBiscuitStandings(validContests, teamGroups));

  const requestedType = req.query.type || req.query.mode || "normal";
  const activeStandings =
    requestedType === "elo"
      ? enrich(buildEloStandings(validContests, teamGroups, "normal"))
      : biscuitStandings;

  return res.json({
    contests,
    teams,
    standings: activeStandings,
    standingsByType: {
      normal: biscuitStandings,
      biscuit: biscuitStandings,
      "gain-only": biscuitStandings,
      "zero-participation": biscuitStandings,
      elo: enrich(buildEloStandings(validContests, teamGroups, "normal")),
    },
    errors,
  });
});

export default router;
