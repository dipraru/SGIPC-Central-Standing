import axios from "axios";

const PENALTY_PER_WRONG = 20 * 60;
const ELO_BASE_RATING = 1500;
const ELO_K_FACTOR = 32;

const client = axios.create({
  baseURL: "https://vjudge.net",
  timeout: 15000,
});

const normalizeName = (value = "") =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const formatRating = (value) => {
  if (!Number.isFinite(value)) {
    return ELO_BASE_RATING.toFixed(4);
  }
  return value.toFixed(4);
};

const normalizeSecondsValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
};

const normalizeTimestampValue = (value) => {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
};

const resolveContestLength = (rankData) => {
  if (!rankData) return Infinity;
  const directSources = [
    rankData.length,
    rankData.duration,
    rankData.contestLength,
    rankData?.contest?.length,
    rankData?.contest?.duration,
  ];
  for (const source of directSources) {
    const seconds = normalizeSecondsValue(source);
    if (seconds) return seconds;
  }

  const startCandidates = [
    rankData.startTime,
    rankData.begin,
    rankData.beginTime,
    rankData.start,
    rankData?.contest?.startTime,
    rankData?.contest?.begin,
  ];
  const endCandidates = [
    rankData.endTime,
    rankData.finishTime,
    rankData.end,
    rankData?.contest?.endTime,
    rankData?.contest?.end,
  ];

  const startSeconds = startCandidates
    .map((candidate) => normalizeTimestampValue(candidate))
    .find((value) => Number.isFinite(value));
  const endSeconds = endCandidates
    .map((candidate) => normalizeTimestampValue(candidate))
    .find((value) => Number.isFinite(value));

  if (startSeconds && endSeconds && endSeconds > startSeconds) {
    return normalizeSecondsValue(endSeconds - startSeconds) || Infinity;
  }

  return Infinity;
};

const buildRanklist = (rankData) => {
  if (!rankData?.participants || !Array.isArray(rankData?.submissions)) {
    if (Array.isArray(rankData?.ranklist) && rankData.ranklist.length) {
      return rankData.ranklist;
    }
    return null;
  }

  const contestLength = resolveContestLength(rankData);

  const teams = new Map();
  Object.entries(rankData.participants).forEach(([teamId, info]) => {
    const username = info?.[0] || "";
    const displayName = info?.[1] || username || `Team ${teamId}`;
    teams.set(Number(teamId), {
      teamId: Number(teamId),
      displayName,
      username,
      aliases: Array.from(
        new Set(
          [
            displayName,
            username,
            displayName.replace(/_/g, " "),
            username.replace(/_/g, " "),
          ].filter(Boolean)
        )
      ),
      solved: 0,
      penalty: 0,
      submissions: 0,
      attempted: false,
      problems: new Map(),
    });
  });

  const orderedSubs = rankData.submissions
    .map((entry) => ({
      teamId: Number(entry[0]),
      problemId: entry[1],
      accepted: entry[2] === 1,
      time: entry[3] || 0,
    }))
    .filter((sub) => (contestLength !== Infinity ? sub.time <= contestLength : true))
    .sort((a, b) => a.time - b.time);

  orderedSubs.forEach((sub) => {
    const team = teams.get(sub.teamId);
    if (!team) return;
    team.attempted = true;
    team.submissions += 1;
    let problemRecord = team.problems.get(sub.problemId);
    if (!problemRecord) {
      problemRecord = { wrong: 0, solved: false };
      team.problems.set(sub.problemId, problemRecord);
    }
    if (problemRecord.solved) return;
    if (sub.accepted) {
      problemRecord.solved = true;
      problemRecord.time = sub.time;
      team.solved += 1;
      team.penalty += sub.time + problemRecord.wrong * PENALTY_PER_WRONG;
    } else {
      problemRecord.wrong += 1;
    }
  });

  const ranked = Array.from(teams.values())
    .filter((team) => team.attempted || team.solved)
    .sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      return (a.penalty || 0) - (b.penalty || 0);
    });

  let prevKey = null;
  let currentRank = 0;
  ranked.forEach((team, index) => {
    const key = `${team.solved}-${team.penalty}`;
    if (key !== prevKey) {
      currentRank = index + 1;
      prevKey = key;
    }
    team.rank = currentRank;
  });

  return ranked.map((team) => ({
    team_id: team.teamId,
    team_name: team.displayName,
    rank: team.rank,
    solved: team.solved,
    penalty: team.penalty,
    penaltyDisplay: `${team.penalty}`,
    time: `${team.penalty}`,
    submissions: team.submissions,
    aliases: team.aliases,
  }));
};

const extractEntryAliases = (entry = {}) => {
  const aliases = [];
  const push = (value) => {
    if (value) aliases.push(value);
  };
  push(entry.team_name);
  push(entry.teamName);
  push(entry.username);
  push(entry.userName);
  if (Array.isArray(entry.aliases)) {
    entry.aliases.forEach(push);
  }
  return Array.from(new Set(aliases.filter(Boolean)));
};

const getParticipantHandle = (participants = {}, teamId) => {
  if (!participants || teamId === undefined || teamId === null) return "";
  const info = participants[teamId];
  if (!info) return "";
  if (Array.isArray(info)) {
    return info[0] || info[1] || "";
  }
  if (typeof info === "object") {
    return info.username || info.userName || info.name || "";
  }
  return "";
};

const derivePreferredHandle = (entry = {}, participants = {}) => {
  const teamId = entry.team_id ?? entry.teamId ?? entry.id;
  return (
    getParticipantHandle(participants, teamId) ||
    entry.userName ||
    entry.username ||
    entry.name ||
    entry.team_name ||
    entry.teamName ||
    ""
  );
};

const findTeamRecord = (teamName, ranklist, participants = {}) => {
  const target = normalizeName(teamName);
  if (!target) return null;

  const rankMatch = ranklist?.find((entry) => {
    const aliases = [entry.team_name, entry.teamName, ...(entry.aliases || [])].filter(
      Boolean
    );
    return aliases.some((alias) => normalizeName(alias) === target);
  });

  if (rankMatch) {
    return { entry: rankMatch };
  }

  for (const [teamId, info] of Object.entries(participants)) {
    const aliases = [info?.[0], info?.[1], info?.[0]?.replace(/_/g, " "), info?.[1]?.replace(/_/g, " ")].filter(Boolean);
    if (aliases.some((alias) => normalizeName(alias) === target)) {
      return { participant: { id: Number(teamId), info } };
    }
  }

  return null;
};

const findBestGroupMatch = (teamGroup, ranklist, participants = {}) => {
  if (!teamGroup) return null;
  let bestEntry = null;
  let bestAlias = null;
  let fallbackParticipant = null;
  let fallbackAlias = null;

  for (const alias of teamGroup.aliases) {
    const lookup = findTeamRecord(alias, ranklist, participants);
    if (lookup?.entry) {
      const entry = lookup.entry;
      const entryRank = Number(entry.rank);
      const currentBestRank = bestEntry ? Number(bestEntry.rank) : Infinity;
      if (!bestEntry || (Number.isFinite(entryRank) && entryRank < currentBestRank)) {
        bestEntry = entry;
        bestAlias = alias;
      }
    } else if (lookup?.participant && !fallbackParticipant) {
      fallbackParticipant = lookup.participant;
      fallbackAlias = alias;
    }
  }

  return {
    entry: bestEntry,
    participant: fallbackParticipant,
    alias: bestAlias || fallbackAlias || null,
  };
};

export const fetchContestRank = async (contestId) => {
  const url = `/contest/rank/single/${contestId}`;
  const { data } = await client.get(url, {
    headers: { Accept: "application/json" },
  });
  const ranklist = buildRanklist(data);
  if (!ranklist) {
    return { error: "No ranklist data was returned. VJudge may be throttling anonymous API calls." };
  }
  return {
    ranklist,
    participants: data.participants || {},
    title: data.title || "",
  };
};

export const buildEloStandings = (contestPayloads, teamGroups, mode = "normal") => {
  const eloMode = mode || "normal";
  const ratingState = new Map();

  const ensureTeam = (group) => {
    if (!group) return null;
    let record = ratingState.get(group.id);
    if (!record) {
      record = {
        id: group.id,
        name: group.displayName,
        rating: ELO_BASE_RATING,
        wins: 0,
        losses: 0,
        draws: 0,
        contests: 0,
      };
      ratingState.set(group.id, record);
    }
    return record;
  };

  teamGroups.forEach((group) => ensureTeam(group));

  // If there are teams but no contest data yet, return base ratings so UI is not empty
  if (!contestPayloads.length) {
    return Array.from(ratingState.values())
      .map((record) => ({
        ...record,
        ratingDisplay: formatRating(record.rating),
      }))
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
      .map((record, index) => ({
        ...record,
        rank: index + 1,
      }));
  }

  for (const contestData of contestPayloads) {
    if (!contestData?.ranklist) continue;

    const condensed = new Map();
    for (const group of teamGroups) {
      const match = findBestGroupMatch(group, contestData.ranklist, contestData.participants);
      const rankValue = Number(match?.entry?.rank);
      if (!Number.isFinite(rankValue)) continue;
      const existing = condensed.get(group.id);
      if (!existing || rankValue < existing.rank) {
        condensed.set(group.id, { group, rank: rankValue });
      }
    }

    if (!condensed.size && eloMode !== "zero-participation") {
      continue;
    }

    let ordered = Array.from(condensed.values()).sort((a, b) => a.rank - b.rank);

    if (!ordered.length && eloMode === "zero-participation") {
      ordered = teamGroups.map((group) => ({ group, rank: Number.MAX_SAFE_INTEGER }));
    }

    if (eloMode === "zero-participation")
      {
        const present = new Set(ordered.map((item) => item.group.id));
        teamGroups.forEach((group) => {
          if (!present.has(group.id)) {
            ordered.push({ group, rank: Number.MAX_SAFE_INTEGER });
            present.add(group.id);
          }
        });
        ordered = ordered.sort((a, b) => a.rank - b.rank);
      }

    const seenThisContest = new Set();

    ordered.forEach((entry) => {
      const record = ensureTeam(entry.group);
      if (record && !seenThisContest.has(record.id)) {
        record.contests += 1;
        seenThisContest.add(record.id);
      }
    });

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const teamA = ensureTeam(ordered[i].group);
        const teamB = ensureTeam(ordered[j].group);
        if (!teamA || !teamB) continue;
        const expectedA = 1 / (1 + Math.pow(10, (teamB.rating - teamA.rating) / 400));
        const expectedB = 1 - expectedA;
        let scoreA = 1;
        let scoreB = 0;

        if (ordered[i].rank === ordered[j].rank) {
          scoreA = 0.5;
          scoreB = 0.5;
          teamA.draws += 1;
          teamB.draws += 1;
        } else {
          teamA.wins += 1;
          teamB.losses += 1;
        }

        let deltaA = ELO_K_FACTOR * (scoreA - expectedA);
        let deltaB = ELO_K_FACTOR * (scoreB - expectedB);

        if (eloMode === "gain-only") {
          if (deltaA < 0) deltaA = 0;
          if (deltaB < 0) deltaB = 0;
        }

        teamA.rating += deltaA;
        teamB.rating += deltaB;
      }
    }
  }

  return Array.from(ratingState.values())
    .map((record) => ({
      ...record,
      ratingDisplay: formatRating(record.rating),
    }))
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.name.localeCompare(b.name);
    })
    .map((record, index) => ({
      ...record,
      rank: index + 1,
    }));
};

export const buildTeamGroups = (teams) =>
  teams.map((team) => ({
    id: team._id.toString(),
    displayName: team.name,
    aliases: [team.name, ...(team.aliases || [])].filter(Boolean),
  }));

export const normalizeContestIds = (contests) =>
  contests.map((contest) => contest.contestId.toString());
