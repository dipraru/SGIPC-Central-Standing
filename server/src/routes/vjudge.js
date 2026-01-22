import express from "express";
import { VjudgeContest } from "../models/VjudgeContest.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { VjudgeConfig } from "../models/VjudgeConfig.js";
import {
  buildEloStandings,
  buildTeamGroups,
  fetchContestRank,
} from "../services/vjudge.js";

const router = express.Router();

router.get("/vjudge/standings", async (req, res) => {
  const contests = await VjudgeContest.find({ enabled: true }).lean();
  const teams = await VjudgeTeam.find().lean();
  const config = await VjudgeConfig.findOne().lean();
  const eloMode = config?.eloMode || "normal";

  if (!contests.length || !teams.length) {
    return res.json({
      contests: [],
      teams: [],
      standings: [],
      eloMode,
    });
  }

  const contestPayloads = await Promise.all(
    contests.map(async (contest) => {
      try {
        const data = await fetchContestRank(contest.contestId);
        if (data.error) {
          return null;
        }
        if (data.title && data.title !== contest.title) {
          await VjudgeContest.findByIdAndUpdate(contest._id, {
            title: data.title,
          });
        }
        return { ...data, contestId: contest.contestId };
      } catch (error) {
        return null;
      }
    })
  );

  const validContests = contestPayloads.filter(Boolean);
  const teamGroups = buildTeamGroups(teams);
  const standings = buildEloStandings(validContests, teamGroups, eloMode);

  return res.json({
    contests,
    teams,
    standings,
    eloMode,
  });
});

export default router;
