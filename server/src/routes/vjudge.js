import express from "express";
import { VjudgeContest } from "../models/VjudgeContest.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { VjudgeConfig } from "../models/VjudgeConfig.js";
import {
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
                return { ...fresh, contestId: contest.contestId };
              }
            } catch (e) {}
          }

          return {
            contestId: contest.contestId,
            title: contest.title || `Contest #${contest.contestId}`,
            ranklist: contest.ranklist,
            participants: contest.participants || {},
          };
        }

        const data = await syncContestRank(VjudgeContest, contest);
        if (data.error) {
          errors.push({ contestId: contest.contestId, message: data.error });
          return null;
        }
        return { ...data, contestId: contest.contestId };
      } catch (error) {
        if (contest.ranklist && Array.isArray(contest.ranklist) && contest.ranklist.length > 0) {
          return {
            contestId: contest.contestId,
            title: contest.title || `Contest #${contest.contestId}`,
            ranklist: contest.ranklist,
            participants: contest.participants || {},
          };
        }
        return null;
      }
    })
  );

  const validContests = contestPayloads.filter(Boolean);
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

  const normalStandings = enrich(buildEloStandings(validContests, teamGroups, "normal"));
  const gainOnlyStandings = enrich(buildEloStandings(validContests, teamGroups, "gain-only"));
  const zeroPartStandings = enrich(buildEloStandings(validContests, teamGroups, "zero-participation"));

  const requestedType = req.query.type || req.query.mode || "normal";
  const activeStandings =
    requestedType === "gain-only"
      ? gainOnlyStandings
      : requestedType === "zero-participation"
      ? zeroPartStandings
      : normalStandings;

  return res.json({
    contests,
    teams,
    standings: activeStandings,
    standingsByType: {
      normal: normalStandings,
      "gain-only": gainOnlyStandings,
      "zero-participation": zeroPartStandings,
    },
    errors,
  });
});

export default router;
