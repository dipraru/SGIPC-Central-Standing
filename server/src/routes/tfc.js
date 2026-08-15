import express from "express";
import axios from "axios";
import bcrypt from "bcryptjs";
import { TfcParticipant } from "../models/TfcParticipant.js";
import { TfcContest } from "../models/TfcContest.js";
import { TfcRequest } from "../models/TfcRequest.js";
import { TfcReport } from "../models/TfcReport.js";
import { Passkey } from "../models/Passkey.js";
import { buildEloStandings, fetchContestRank } from "../services/vjudge.js";

const router = express.Router();

// Helper to extract YouTube playlist ID or Video ID
export const parseYoutubeUrl = (url) => {
  if (!url || typeof url !== "string") return { type: null, id: null };
  const trimmed = url.trim();

  // Playlist match: list=PL... or list=...
  const playlistMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (playlistMatch && playlistMatch[1]) {
    return { type: "playlist", id: playlistMatch[1] };
  }

  // Single video match
  const videoMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
  if (videoMatch && videoMatch[1]) {
    return { type: "video", id: videoMatch[1] };
  }

  return { type: null, id: null };
};

// Helper to fetch playlist items from YouTube (supports unlisted & public playlists)
export const fetchPlaylistVideos = async (playlistId) => {
  const entries = [];
  const seenIds = new Set();

  // 1. Try fetching via YouTube Playlist Webpage (ytInitialData parser - works for unlisted playlists & videos)
  try {
    const pageUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    const pageRes = await axios.get(pageUrl, {
      timeout: 9000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = pageRes.data;
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/s);
    if (match) {
      const data = JSON.parse(match[1]);
      const extractFromRenderer = (obj) => {
        if (!obj || typeof obj !== "object") return;
        if (obj.playlistVideoRenderer) {
          const p = obj.playlistVideoRenderer;
          const videoId = p.videoId;
          if (videoId && !seenIds.has(videoId)) {
            seenIds.add(videoId);
            const title =
              p.title?.runs?.[0]?.text ||
              p.title?.simpleText ||
              (p.title?.accessibility?.accessibilityData?.label ? p.title.accessibility.accessibilityData.label.split(" by ")[0] : `Video ${videoId}`);
            const duration = p.lengthText?.simpleText || "";
            const thumb =
              p.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            entries.push({
              videoId,
              title: title.trim(),
              duration,
              url: `https://www.youtube.com/watch?v=${videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
              thumbnailUrl: thumb,
              publishedAt: null,
            });
          }
          return;
        }
        for (const k of Object.keys(obj)) {
          extractFromRenderer(obj[k]);
        }
      };

      extractFromRenderer(data);
    }
  } catch (pageErr) {
    console.error("ytInitialData scraper failed for playlist:", pageErr.message);
  }

  // 2. If nothing found, try Atom XML feed
  if (entries.length === 0) {
    try {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
      const response = await axios.get(feedUrl, {
        timeout: 8000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SGIPC-Standing/1.0",
        },
      });
      const xml = response.data;
      const entryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

      for (const entryXml of entryMatches) {
        const videoIdMatch = entryXml.match(/<yt:videoId>(.*?)<\/yt:videoId>/i);
        const titleMatch = entryXml.match(/<title>(.*?)<\/title>/i);
        const publishedMatch = entryXml.match(/<published>(.*?)<\/published>/i);

        if (videoIdMatch && videoIdMatch[1]) {
          const videoId = videoIdMatch[1].trim();
          if (!seenIds.has(videoId)) {
            seenIds.add(videoId);
            let title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : `Video ${videoId}`;
            title = title
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");

            entries.push({
              videoId,
              title,
              url: `https://www.youtube.com/watch?v=${videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
              thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              publishedAt: publishedMatch ? publishedMatch[1] : null,
            });
          }
        }
      }
    } catch (feedErr) {
      console.error("Failed to fetch YouTube playlist XML feed:", feedErr.message);
    }
  }

  // Sort naturally by title (e.g. TFC-1, TFC-2, TFC-10)
  entries.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));

  return entries;
};

// ── GET TFC Standings ────────────────────────────────────────────────────────
router.get("/tfc/standings", async (req, res) => {
  try {
    const contests = await TfcContest.find({ enabled: true }).lean();
    const participants = await TfcParticipant.find().lean();
    const errors = [];

    if (!contests.length || !participants.length) {
      return res.json({
        contests: [],
        participants: [],
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
          const data = await fetchContestRank(contest.contestId);
          if (data.error) {
            errors.push({ contestId: contest.contestId, message: data.error });
            return null;
          }
          if (data.title && data.title !== contest.title) {
            await TfcContest.findByIdAndUpdate(contest._id, { title: data.title });
          }
          return { ...data, contestId: contest.contestId };
        } catch (error) {
          return null;
        }
      })
    );

    const validContests = contestPayloads.filter(Boolean);

    // Map each participant to a group entity for Elo calculation
    const tfcGroups = participants.map((p) => ({
      id: p._id.toString(),
      displayName: p.name,
      aliases: (p.vjudgeHandles || []).filter(Boolean),
    }));

    const partById = new Map(participants.map((p) => [p._id.toString(), p]));

    const enrich = (rows) =>
      rows.map((row) => {
        const p = partById.get(row.id);
        return {
          ...row,
          roll: p?.roll || "",
          batch: p?.batch || "",
          vjudgeHandles: p?.vjudgeHandles || [],
          codeforcesHandle: p?.codeforcesHandle || "",
          otherOjs: p?.otherOjs || [],
          playlistUrl: p?.playlistUrl || "",
        };
      });

    const normalStandings = enrich(buildEloStandings(validContests, tfcGroups, "normal"));
    const gainOnlyStandings = enrich(buildEloStandings(validContests, tfcGroups, "gain-only"));
    const zeroPartStandings = enrich(buildEloStandings(validContests, tfcGroups, "zero-participation"));

    const requestedType = req.query.type || req.query.mode || "normal";
    const activeStandings =
      requestedType === "gain-only"
        ? gainOnlyStandings
        : requestedType === "zero-participation"
        ? zeroPartStandings
        : normalStandings;

    return res.json({
      contests,
      participants,
      standings: activeStandings,
      standingsByType: {
        normal: normalStandings,
        "gain-only": gainOnlyStandings,
        "zero-participation": zeroPartStandings,
      },
      errors,
    });
  } catch (err) {
    console.error("TFC standings error:", err);
    return res.status(500).json({ message: "Failed to calculate TFC standings" });
  }
});

// ── GET All TFC Participants ─────────────────────────────────────────────────
router.get("/tfc/participants", async (req, res) => {
  try {
    const participants = await TfcParticipant.find().sort({ batch: -1, roll: 1 }).lean();
    return res.json(participants);
  } catch (err) {
    return res.status(500).json({ message: "Failed to load participants" });
  }
});

// ── GET Single TFC Participant with Videos ───────────────────────────────────
router.get("/tfc/participants/:id", async (req, res) => {
  try {
    const participant = await TfcParticipant.findById(req.params.id).lean();
    if (!participant) {
      return res.status(404).json({ message: "Contestant not found" });
    }

    let videos = [];
    const ytInfo = parseYoutubeUrl(participant.playlistUrl);

    if (ytInfo.type === "playlist") {
      videos = await fetchPlaylistVideos(ytInfo.id);
    } else if (ytInfo.type === "video") {
      videos = [
        {
          videoId: ytInfo.id,
          title: "Contest Recording",
          url: `https://www.youtube.com/watch?v=${ytInfo.id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${ytInfo.id}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${ytInfo.id}/hqdefault.jpg`,
          publishedAt: participant.createdAt,
        },
      ];
    }

    // Fetch reports for this participant to compute per-video report counts
    const reports = await TfcReport.find({ participantId: req.params.id }).lean();

    // Map report counts to each video
    videos = videos.map((vid) => {
      const count = reports.filter((r) => {
        if (r.videoUrl && vid.url && r.videoUrl === vid.url) return true;
        if (r.videoUrl && vid.videoId && r.videoUrl.includes(vid.videoId)) return true;
        if (r.videoTitle && vid.title && r.videoTitle.trim() === vid.title.trim()) return true;
        return false;
      }).length;
      return {
        ...vid,
        reportCount: count,
      };
    });

    return res.json({
      participant,
      ytInfo,
      videos,
    });
  } catch (err) {
    console.error("Error fetching participant video details:", err);
    return res.status(500).json({ message: "Failed to load contestant video details" });
  }
});

// ── POST TFC Join Request ────────────────────────────────────────────────────
router.post("/tfc/request", async (req, res) => {
  try {
    const { name, roll, batch, vjudgeHandles, codeforcesHandle, otherOjs, playlistUrl, passkey } = req.body;

    if (!name || !roll || !batch || !passkey) {
      return res.status(400).json({ message: "Name, Roll, Batch, and Passkey are required." });
    }

    let passkeyRecord = await Passkey.findOne().lean();
    if (!passkeyRecord) {
      const keyHash = await bcrypt.hash("sgipc", 10);
      passkeyRecord = await Passkey.create({ keyHash });
    }
    const isValidPasskey = await bcrypt.compare(passkey, passkeyRecord.keyHash);
    if (!isValidPasskey) {
      return res.status(401).json({ message: "Invalid SGIPC passkey." });
    }

    const cleanHandles = Array.isArray(vjudgeHandles)
      ? vjudgeHandles.map((h) => h.trim()).filter(Boolean)
      : typeof vjudgeHandles === "string"
      ? vjudgeHandles.split(",").map((h) => h.trim()).filter(Boolean)
      : [];

    if (!cleanHandles.length) {
      return res.status(400).json({ message: "At least one VJudge handle is required." });
    }

    const BATCH_REGEX = /^2K\d{2}$/i;
    if (!BATCH_REGEX.test(batch.trim())) {
      return res.status(400).json({ message: "Batch must be in the format 2K** (e.g. 2K22)." });
    }

    const cleanOtherOjs = Array.isArray(otherOjs)
      ? otherOjs.map((o) => ({ ojName: (o.ojName || "").trim(), handle: (o.handle || "").trim() })).filter((o) => o.ojName && o.handle)
      : [];

    const request = await TfcRequest.create({
      name: name.trim(),
      roll: roll.trim(),
      batch: batch.trim().toUpperCase(),
      vjudgeHandles: cleanHandles,
      codeforcesHandle: (codeforcesHandle || "").trim(),
      otherOjs: cleanOtherOjs,
      playlistUrl: (playlistUrl || "").trim(),
    });

    return res.status(201).json({ message: "TFC request submitted successfully!", requestId: request._id });
  } catch (err) {
    console.error("TFC Request error:", err);
    return res.status(500).json({ message: "Failed to submit TFC request." });
  }
});

// ── POST Anonymous Video Report ──────────────────────────────────────────────
router.post("/tfc/reports", async (req, res) => {
  try {
    const { participantId, participantName, participantRoll, participantBatch, videoTitle, videoUrl, category, explanation } = req.body;

    if (!participantName || !explanation || !explanation.trim()) {
      return res.status(400).json({ message: "Contestant name and explanation are required." });
    }

    const report = await TfcReport.create({
      participantId: participantId || null,
      participantName: (participantName || "").trim(),
      participantRoll: (participantRoll || "").trim(),
      participantBatch: (participantBatch || "").trim(),
      videoTitle: (videoTitle || "").trim(),
      videoUrl: (videoUrl || "").trim(),
      category: (category || "General Irregularity").trim(),
      explanation: explanation.trim(),
    });

    return res.status(201).json({ message: "Report submitted anonymously.", reportId: report._id });
  } catch (err) {
    console.error("Report submission error:", err);
    return res.status(500).json({ message: "Failed to submit anonymous report." });
  }
});

export default router;
