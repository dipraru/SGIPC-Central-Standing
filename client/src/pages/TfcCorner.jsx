import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getStandings,
  getTfcStandings,
  getTfcParticipants,
  submitTfcRequest,
  getTfcContestStandings,
} from "../api.js";
import { BatchSelect } from "../components/BatchSelect.jsx";
import { BatchFilter } from "../components/BatchFilter.jsx";
import { ContestHistoryModal } from "../components/ContestHistoryModal.jsx";
import { computeBatchOptions, SortIcon } from "./Standings.jsx";

// In-memory module cache to enable instant zero-flicker rehydration on back-navigation
let memTfcStandings = null;
let memTfcParticipants = null;
let memTfcContests = null;

const TFC_STATE_KEYS = {
  tab: "sgipc_tfc_tab",
  type: "sgipc_tfc_type",
  batches: "sgipc_tfc_batches",
  search: "sgipc_tfc_search",
  sortField: "sgipc_tfc_sort_field",
  sortDir: "sgipc_tfc_sort_dir",
  scrollStandings: "sgipc_tfc_scroll_standings",
  scrollDirectory: "sgipc_tfc_scroll_directory",
};

const getInitialTfcTab = () => {
  try { return sessionStorage.getItem(TFC_STATE_KEYS.tab) || "standings"; } catch { return "standings"; }
};
const getInitialSelectedType = () => {
  try { return sessionStorage.getItem(TFC_STATE_KEYS.type) || "normal"; } catch { return "normal"; }
};
const getInitialSelectedBatches = () => {
  try {
    const raw = sessionStorage.getItem(TFC_STATE_KEYS.batches);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};
const getInitialSearchQuery = () => {
  try { return sessionStorage.getItem(TFC_STATE_KEYS.search) || ""; } catch { return ""; }
};
const getInitialSortField = () => {
  try { return sessionStorage.getItem(TFC_STATE_KEYS.sortField) || "rank"; } catch { return "rank"; }
};
const getInitialSortDir = () => {
  try { return sessionStorage.getItem(TFC_STATE_KEYS.sortDir) || "asc"; } catch { return "asc"; }
};

const saveTfcTab = (tab) => {
  try { sessionStorage.setItem(TFC_STATE_KEYS.tab, tab); } catch {}
};

const TFC_RANKING_TYPES = [
  {
    id: "normal",
    label: "Standard",
    description: "Standard performance rating based on head-to-head TFC contest results",
  },
  {
    id: "gain-only",
    label: "Gain Only",
    description: "Ratings where contestants only gain points from performance without penalties",
  },
  {
    id: "zero-participation",
    label: "Participation Weighted",
    description: "Overall rankings factoring in both contest performance and active participation",
  },
];

const rankCls = (n) => (n === 1 ? "gold" : n === 2 ? "silver" : n === 3 ? "bronze" : "default");
const extractBatchDigits = (b) => { const m = (b || "").match(/(\d{2})$/); return m ? m[1] : null; };
const normalizeBatch = (b) => { const d = extractBatchDigits(b); return d ? `2K${d}` : null; };

const TfcCorner = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(getInitialTfcTab);
  const isRestoringScrollRef = React.useRef(true);

  const switchTab = (t) => {
    setActiveTab(t);
    saveTfcTab(t);
    isRestoringScrollRef.current = true;
  };

  // ── Standings data ─────────────────────────────────────────────────────────
  const [standings, setStandings] = useState(() => memTfcStandings?.standings || []);
  const [standingsMap, setStandingsMap] = useState(() => memTfcStandings?.standingsByType || { normal: [], "gain-only": [], "zero-participation": [] });
  const [contests, setContests] = useState(() => memTfcContests || []);
  const [selectedType, setSelectedType] = useState(getInitialSelectedType);
  const [loading, setLoading] = useState(() => !memTfcStandings);
  const [error, setError] = useState("");

  // ── Participants directory data ────────────────────────────────────────────
  const [participants, setParticipants] = useState(() => memTfcParticipants || []);
  const [participantsLoading, setParticipantsLoading] = useState(() => !memTfcParticipants);

  // ── Modals & filters ───────────────────────────────────────────────────────
  const [contestsModalOpen, setContestsModalOpen] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState(getInitialSelectedBatches);
  const [batchFilterOpen, setBatchFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery);

  const [sortField, setSortField] = useState(getInitialSortField);
  const [sortDir, setSortDir] = useState(getInitialSortDir);

  // Sync state changes to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem(TFC_STATE_KEYS.type, selectedType); } catch {}
  }, [selectedType]);

  useEffect(() => {
    try { sessionStorage.setItem(TFC_STATE_KEYS.batches, JSON.stringify(selectedBatches)); } catch {}
  }, [selectedBatches]);

  useEffect(() => {
    try { sessionStorage.setItem(TFC_STATE_KEYS.search, searchQuery); } catch {}
  }, [searchQuery]);

  useEffect(() => {
    try { sessionStorage.setItem(TFC_STATE_KEYS.sortField, sortField); } catch {}
  }, [sortField]);

  useEffect(() => {
    try { sessionStorage.setItem(TFC_STATE_KEYS.sortDir, sortDir); } catch {}
  }, [sortDir]);

  // ── Contest History Modal State ───────────────────────────────────────────
  const [contestHistoryTarget, setContestHistoryTarget] = useState(null);

  // ── Single Contest Standings State ──────────────────────────────────────────
  const [selectedContestId, setSelectedContestId] = useState("");
  const [contestStandingsData, setContestStandingsData] = useState(null);
  const [contestStandingsLoading, setContestStandingsLoading] = useState(false);
  const [contestStandingsError, setContestStandingsError] = useState("");
  const [contestSearchQuery, setContestSearchQuery] = useState("");
  const [visibleStandingsCount, setVisibleStandingsCount] = useState(50);
  const [visibleContestCount, setVisibleContestCount] = useState(50);
  const contestStandingsCache = useRef({});

  // Dynamic incremental row loading on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        if (activeTab === "standings") {
          setVisibleStandingsCount((prev) => prev + 30);
        } else if (activeTab === "contest_standings") {
          setVisibleContestCount((prev) => prev + 30);
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab]);

  // Track scroll position per tab
  useEffect(() => {
    const handleScroll = () => {
      if (isRestoringScrollRef.current) return;
      try {
        const key = activeTab === "directory" ? TFC_STATE_KEYS.scrollDirectory : TFC_STATE_KEYS.scrollStandings;
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {}
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab]);

  const goToContestant = (id) => {
    try {
      const key = activeTab === "directory" ? TFC_STATE_KEYS.scrollDirectory : TFC_STATE_KEYS.scrollStandings;
      sessionStorage.setItem(key, String(window.scrollY));
    } catch {}
    navigate(`/tfc/contestant/${id}`);
  };

  // ── Registration Modal State ───────────────────────────────────────────────
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [rName, setRName] = useState("");
  const [rRoll, setRRoll] = useState("");
  const [rBatch, setRBatch] = useState("");
  const [rVjudgeHandles, setRVjudgeHandles] = useState([""]);
  const [rCfHandle, setRCfHandle] = useState("");
  const [rOtherOjs, setROtherOjs] = useState([]);
  const [rPlaylistUrl, setRPlaylistUrl] = useState("");
  const [rPasskey, setRPasskey] = useState("");
  const [rLoading, setRLoading] = useState(false);
  const [rError, setRError] = useState("");
  const [rDone, setRDone] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [topNLimit, setTopNLimit] = useState(10);
  const [publicMinParticipation, setPublicMinParticipation] = useState(0);

  // Fetch TFC Standings
  const fetchStandings = useCallback(async () => {
    try {
      if (!memTfcStandings) setLoading(true);
      const data = await getTfcStandings();
      memTfcStandings = data;
      memTfcContests = data.contests || [];
      if (typeof data.topNLimit === "number") {
        setTopNLimit(data.topNLimit);
      }
      if (data.config) {
        if (typeof data.config.publicTopNLimit === "number") {
          setTopNLimit(data.config.publicTopNLimit);
        }
        if (typeof data.config.publicMinParticipation === "number") {
          setPublicMinParticipation(data.config.publicMinParticipation);
        }
      }
      if (data.standingsByType) {
        setStandingsMap(data.standingsByType);
      }
      setStandings(data.standings || []);
      setContests(data.contests || []);
      setError("");
    } catch (err) {
      if (!memTfcStandings) setError("Unable to load TFC standings.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch TFC Participants
  const fetchParticipants = useCallback(async () => {
    try {
      if (!memTfcParticipants) setParticipantsLoading(true);
      const data = await getTfcParticipants();
      memTfcParticipants = data || [];
      setParticipants(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  const [centralStandings, setCentralStandings] = useState([]);

  useEffect(() => {
    fetchStandings();
    fetchParticipants();
    getStandings().then((data) => setCentralStandings(data || [])).catch(() => {});
  }, [fetchStandings, fetchParticipants]);

  // When contests list arrives, initialize selectedContestId if empty
  useEffect(() => {
    if (contests.length > 0 && !selectedContestId) {
      setSelectedContestId(String(contests[0].contestId));
    }
  }, [contests, selectedContestId]);

  // Fetch contest standings when selectedContestId changes
  useEffect(() => {
    if (!selectedContestId) return;
    const cacheKey = String(selectedContestId);
    if (contestStandingsCache.current[cacheKey]) {
      setContestStandingsData(contestStandingsCache.current[cacheKey]);
      setContestStandingsLoading(false);
      return;
    }

    let isMounted = true;
    setContestStandingsLoading(true);
    setContestStandingsError("");

    getTfcContestStandings(selectedContestId)
      .then((data) => {
        if (isMounted) {
          contestStandingsCache.current[cacheKey] = data;
          setContestStandingsData(data);
        }
      })
      .catch(() => {
        if (isMounted) setContestStandingsError("Failed to load standings for this contest.");
      })
      .finally(() => {
        if (isMounted) setContestStandingsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedContestId]);

  const displayedContestStandings = useMemo(() => {
    if (!contestStandingsData?.standings) return [];
    let list = contestStandingsData.standings;
    if (contestSearchQuery.trim()) {
      const q = contestSearchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        return (
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.roll && item.roll.toLowerCase().includes(q)) ||
          (item.teamName && item.teamName.toLowerCase().includes(q)) ||
          (item.codeforcesHandle && item.codeforcesHandle.toLowerCase().includes(q)) ||
          (item.vjudgeHandles && item.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
        );
      });
    }
    return list;
  }, [contestStandingsData, contestSearchQuery]);

  // Dynamic Batch options (combines central standings, TFC standings and participants)
  const formBatchOptions = useMemo(() => {
    return computeBatchOptions([...centralStandings, ...standings], participants, []);
  }, [centralStandings, standings, participants]);

  const qualifiedStandingsList = useMemo(() => {
    const raw = standingsMap[selectedType] || standings;
    let list = raw.slice();
    if (publicMinParticipation > 0) {
      list = list.filter((p) => (p.contests || 0) >= publicMinParticipation);
    }
    list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    return list.map((p, idx) => ({
      ...p,
      globalRank: p.globalRank || p.rank,
      rank: idx + 1,
    }));
  }, [standingsMap, selectedType, standings, publicMinParticipation]);

  const availableBatches = useMemo(() => {
    const s = new Set();
    const source = activeTab === "standings" ? qualifiedStandingsList : participants;
    source.forEach((r) => {
      const b = normalizeBatch(r.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort((a, b) => {
      const na = parseInt(extractBatchDigits(a) || "0", 10);
      const nb = parseInt(extractBatchDigits(b) || "0", 10);
      return nb - na;
    });
  }, [activeTab, qualifiedStandingsList, participants]);

  // Filtered standings — when a batch is selected, show as true standings for that batch!
  const displayedStandings = useMemo(() => {
    let list = qualifiedStandingsList.slice();

    // 1. Batch filter: filter all qualified participants by selected batch(es) FIRST!
    if (selectedBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && selectedBatches.includes(b);
      });
      // Sort strictly by rating descending to form true standings for this batch
      list.sort((a, b) => {
        const diff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (diff !== 0) return diff;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      // Re-index rank so this batch is ranked #1, #2, #3...
      list = list.map((r, idx) => ({
        ...r,
        batchRank: idx + 1,
        rank: idx + 1,
      }));
    }

    // 2. Limit to top N of this standings (if configured)
    if (topNLimit > 0) {
      list = list.slice(0, topNLimit);
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.roll && r.roll.toLowerCase().includes(q)) ||
          (r.codeforcesHandle && r.codeforcesHandle.toLowerCase().includes(q)) ||
          (r.vjudgeHandles && r.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
      );
    }

    // 4. User column sort (if clicking headers)
    if (sortField !== "rank" || sortDir !== "asc") {
      list.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === "rank" || sortField === "contests") {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        } else if (sortField === "rating") {
          valA = Number(a.rating) || 0;
          valB = Number(b.rating) || 0;
        } else {
          valA = String(valA || "").toLowerCase();
          valB = String(valB || "").toLowerCase();
        }
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [qualifiedStandingsList, selectedBatches, topNLimit, searchQuery, sortField, sortDir]);

  // Filtered participants directory
  const displayedParticipants = useMemo(() => {
    let list = participants.slice();
    if (selectedBatches.length > 0) {
      list = list.filter((p) => {
        const b = normalizeBatch(p.batch);
        return b && selectedBatches.includes(b);
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.roll && p.roll.toLowerCase().includes(q)) ||
          (p.codeforcesHandle && p.codeforcesHandle.toLowerCase().includes(q)) ||
          (p.vjudgeHandles && p.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
      );
    }
    return list;
  }, [participants, selectedBatches, searchQuery]);

  // Restore scroll position after data has finished rendering
  useEffect(() => {
    const key = activeTab === "directory" ? TFC_STATE_KEYS.scrollDirectory : TFC_STATE_KEYS.scrollStandings;
    const isDataLoaded = activeTab === "directory"
      ? (!participantsLoading && participants.length > 0)
      : (!loading && displayedStandings.length > 0);

    if (isDataLoaded && isRestoringScrollRef.current) {
      const savedY = parseInt(sessionStorage.getItem(key) || "0", 10);
      if (savedY > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: savedY, behavior: "instant" });
            setTimeout(() => {
              isRestoringScrollRef.current = false;
            }, 80);
          });
        });
      } else {
        isRestoringScrollRef.current = false;
      }
    }
  }, [activeTab, loading, displayedStandings.length, participantsLoading, participants.length]);

  const handleSortClick = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "rating" ? "desc" : "asc");
    }
  };

  const toggleBatch = (b) => {
    setSelectedBatches((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  };

  // ── Form Helpers ───────────────────────────────────────────────────────────
  const resetForm = () => {
    setRName("");
    setRRoll("");
    setRBatch("");
    setRVjudgeHandles([""]);
    setRCfHandle("");
    setROtherOjs([]);
    setRPlaylistUrl("");
    setRPasskey("");
    setRError("");
    setRDone(false);
    setFormKey((k) => k + 1);
  };

  const openFormModal = () => {
    resetForm();
    setFormModalOpen(true);
  };

  const addVjudgeHandleField = () => setRVjudgeHandles((p) => [...p, ""]);
  const updateVjudgeHandleField = (idx, val) =>
    setRVjudgeHandles((p) => p.map((h, i) => (i === idx ? val : h)));
  const removeVjudgeHandleField = (idx) =>
    setRVjudgeHandles((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p));

  const addOtherOjRow = () => setROtherOjs((p) => [...p, { ojName: "", handle: "" }]);
  const updateOtherOjRow = (idx, field, val) =>
    setROtherOjs((p) => p.map((o, i) => (i === idx ? { ...o, [field]: val } : o)));
  const removeOtherOjRow = (idx) => setROtherOjs((p) => p.filter((_, i) => i !== idx));

  const submitForm = async () => {
    setRError("");
    if (rLoading) return;

    if (!rName.trim() || !rRoll.trim() || !rBatch.trim() || !rPasskey.trim()) {
      return setRError("Name, Roll, Batch, and Passkey are required.");
    }

    const BATCH_REGEX = /^2K\d{2}$/i;
    if (!BATCH_REGEX.test(rBatch.trim())) {
      return setRError("Batch must be in the format 2K** (e.g. 2K22).");
    }

    const handles = rVjudgeHandles.map((h) => h.trim()).filter(Boolean);
    if (!handles.length) {
      return setRError("At least one VJudge handle is required.");
    }

    setRLoading(true);
    try {
      await submitTfcRequest({
        name: rName.trim(),
        roll: rRoll.trim(),
        batch: rBatch.trim().toUpperCase(),
        vjudgeHandles: handles,
        codeforcesHandle: rCfHandle.trim(),
        otherOjs: rOtherOjs.filter((o) => o.ojName.trim() && o.handle.trim()),
        playlistUrl: rPlaylistUrl.trim(),
        passkey: rPasskey.trim(),
      });
      setRDone(true);
      setRName("");
      setRRoll("");
      setRBatch("");
      setRVjudgeHandles([""]);
      setRCfHandle("");
      setROtherOjs([]);
      setRPlaylistUrl("");
      setRPasskey("");
      setRError("");
      setFormKey((k) => k + 1);
    } catch (err) {
      setRError(err?.response?.data?.message || "Failed to submit TFC request.");
    } finally {
      setRLoading(false);
    }
  };

  return (
    <div className="container">
      {/* ── HERO / TOP NAVIGATION (LIGHT THEME) ────────────────────────── */}
      <div className="hero">
        <div className="hero-inner" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span className="badge">
                SGIPC · Team Formation Contest
              </span>
            </div>
            <h1>
              TFC <span className="accent">Corner</span>
            </h1>
            <p>
              Performance ratings and contest recordings directory for Team Formation Contests
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="primary sm"
                onClick={openFormModal}
              >
                ＋ Open TFC Form
              </button>
              <Link
                to="/"
                className="secondary sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
                </svg>
                <span>Central Standings</span>
              </Link>
            </div>
          </div>
          <img src="/logo.png" alt="SGIPC" className="hero-logo" />
        </div>
      </div>

      {/* ── MANDATORY SCREEN RECORDING NOTICE (RED BANNER) ──────────────── */}
      <div className="tfc-notice-banner">
        <div className="tfc-notice-icon-wrapper">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </div>
        <div className="tfc-notice-content">
          <div className="tfc-notice-title">
            <span className="tfc-notice-pulse" />
            <span>MANDATORY RULE FOR TFC CONTESTANTS</span>
          </div>
          <p className="tfc-notice-text">
            <strong>Participation without screen recording will NOT be counted!</strong> Every contestant must record their entire screen during all TFC contests and submit their video playlist link via the TFC Form. Unrecorded participations will be excluded from official standings and rating calculations.
          </p>
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button
          className={`tab ${activeTab === "standings" ? "active" : ""}`}
          onClick={() => switchTab("standings")}
          style={{ fontSize: 14, fontWeight: 700 }}
        >
          🏆 TFC Standings
        </button>
        <button
          className={`tab ${activeTab === "contest_standings" ? "active" : ""}`}
          onClick={() => switchTab("contest_standings")}
          style={{ fontSize: 14, fontWeight: 700 }}
        >
          🎯 Contest Standings
        </button>
        <button
          className={`tab ${activeTab === "directory" ? "active" : ""}`}
          onClick={() => switchTab("directory")}
          style={{ fontSize: 14, fontWeight: 700 }}
        >
          📁 Contestant Recordings ({participants.length})
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1: TFC STANDINGS
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "standings" && (
        <div className="card">
          <div className="card-header" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>TFC Rankings</h2>
                {topNLimit > 0 && (
                  <span className="badge" style={{ background: "rgba(99, 102, 241, 0.1)", color: "var(--primary)", border: "1px solid rgba(99, 102, 241, 0.25)", fontSize: 11 }}>
                    Top {topNLimit}
                  </span>
                )}
                {publicMinParticipation > 0 && (
                  <span className="badge" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "1px solid rgba(245, 158, 11, 0.25)", fontSize: 11 }}>
                    Min {publicMinParticipation} {publicMinParticipation === 1 ? "contest" : "contests"}
                  </span>
                )}
              </div>
              <p className="card-subtitle" style={{ marginTop: 4 }}>
                {TFC_RANKING_TYPES.find((t) => t.id === selectedType)?.description || "Individual contest ratings from TFCs"}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                className="secondary sm"
                onClick={() => setContestsModalOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
              >
                📜 Considered Contests ({contests.filter((c) => c.enabled !== false).length})
              </button>

              {/* 3 Ranking Type Switcher */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "var(--bg-subtle)",
                  padding: 4,
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border)",
                  flexWrap: "wrap",
                }}
              >
                {TFC_RANKING_TYPES.map((t) => {
                  const isActive = selectedType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedType(t.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "var(--radius)",
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        background: isActive ? "var(--primary)" : "transparent",
                        color: isActive ? "#ffffff" : "var(--text-secondary)",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: isActive ? "0 2px 8px rgba(37, 99, 235, 0.25)" : "none",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          {!loading && standings.length > 0 && (
            <div className="filter-bar">
              <BatchFilter
                options={availableBatches}
                selectedBatches={selectedBatches}
                onChange={setSelectedBatches}
              />
              <div style={{ width: "100%", maxWidth: 340 }}>
                <div className="search-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search contestant or roll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>×</button>}
                </div>
              </div>
            </div>
          )}

          {loading && <div className="empty-state"><div className="loading-spinner" /><p>Loading TFC standings...</p></div>}
          {!loading && error && <div className="notice error">{error}</div>}
          {!loading && !error && displayedStandings.length === 0 && (
            <div className="empty-state"><p>No TFC contestant standings found.</p></div>
          )}

          {!loading && !error && displayedStandings.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("name")}>
                    Contestant / Roll <SortIcon active={sortField === "name"} direction={sortDir} />
                  </th>
                  <th>Handles</th>
                  <th style={{ width: 100, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("contests")}>
                    Contests <SortIcon active={sortField === "contests"} direction={sortDir} />
                  </th>
                  <th style={{ width: 130, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("rating")}>
                    Rating <SortIcon active={sortField === "rating"} direction={sortDir} />
                  </th>
                  <th style={{ width: 130, textAlign: "center" }}>Videos</th>
                </tr>
              </thead>
              <tbody>
                {displayedStandings.slice(0, visibleStandingsCount).map((row) => (
                  <tr key={row.id}>
                    <td data-label="#">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div
                          className={`rank-badge ${rankCls(row.rank)}`}
                          title={row.globalRank && row.globalRank !== row.rank ? `Configured Rank: #${row.rank} (Overall Global: #${row.globalRank})` : `Rank #${row.rank}`}
                        >
                          {row.rank}
                        </div>
                        {row.globalRank && row.globalRank !== row.rank && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)",
                              marginTop: 2,
                              whiteSpace: "nowrap",
                            }}
                            title={`Overall Global Rank across all participants: #${row.globalRank}`}
                          >
                            (Global #{row.globalRank})
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Contestant">
                      <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>
                        {row.name}
                      </div>
                      <div className="handle-sub" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Roll: {row.roll || "—"} · <span className="text-mono">{normalizeBatch(row.batch) || row.batch}</span>
                      </div>
                    </td>
                    <td data-label="Handles">
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {row.codeforcesHandle && (
                          <a
                            href={`https://codeforces.com/profile/${row.codeforcesHandle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="handle-name"
                            style={{ fontSize: 12 }}
                          >
                            CF: {row.codeforcesHandle}
                          </a>
                        )}
                        {row.vjudgeHandles && row.vjudgeHandles.length > 0 && (
                          <span className="text-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            VJ: {row.vjudgeHandles.join(", ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Contests">
                      <button
                        type="button"
                        onClick={() => setContestHistoryTarget(row)}
                        title={`Click to view ${row.name}'s contest history`}
                        style={{
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border)",
                          borderRadius: 999,
                          padding: "3px 10px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          fontSize: 13,
                          color: "var(--primary)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{row.contests}</span>
                        <span style={{ fontSize: 10, opacity: 0.75 }}>↗</span>
                      </button>
                    </td>
                    <td data-label="Rating">
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)", fontSize: 15 }}>
                        {row.ratingDisplay}
                      </span>
                    </td>
                    <td data-label="Videos" style={{ textAlign: "center" }}>
                      <button
                        className="secondary xs"
                        onClick={() => goToContestant(row.id)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                      >
                        🎥 Recordings &gt;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {displayedStandings.length > visibleStandingsCount && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <button
                  type="button"
                  className="secondary sm"
                  onClick={() => setVisibleStandingsCount((c) => c + 50)}
                  style={{ fontWeight: 600 }}
                >
                  Load More ({displayedStandings.length - visibleStandingsCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: CONTEST STANDINGS (All Participants & Unadded Handles)
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "contest_standings" && (
        <div className="card">
          <div className="card-header" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h2>Contest Standings</h2>
              <p className="card-subtitle">
                Inspect full standings for any individual TFC contest including all participants
              </p>
            </div>

            {/* Contest Selector Dropdown & VJudge Link */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                Select Contest:
              </label>
              <select
                value={selectedContestId}
                onChange={(e) => {
                  setSelectedContestId(e.target.value);
                  setVisibleContestCount(50);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  fontWeight: 600,
                  minWidth: 260,
                  maxWidth: 380,
                  background: "var(--bg-input, var(--bg-card))",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {contests.map((c) => (
                  <option key={c.contestId} value={c.contestId}>
                    #{c.contestId} — {c.title || `Contest #${c.contestId}`} ({c.participantsCount || 0} participants)
                  </option>
                ))}
              </select>

              {selectedContestId && (
                <a
                  href={`https://vjudge.net/contest/${selectedContestId}#rank`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="secondary sm"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 700,
                    borderColor: "rgba(59, 130, 246, 0.4)",
                    color: "var(--primary)",
                    textDecoration: "none",
                    padding: "6px 12px",
                  }}
                  title="View original contest standings on VJudge"
                >
                  <span>🌐 Open VJudge</span>
                  <span style={{ fontSize: 11 }}>↗</span>
                </a>
              )}
            </div>
          </div>

          {/* Stats Bar & Search */}
          <div className="filter-bar" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {contestStandingsData && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  👥 <strong>{contestStandingsData.totalParticipants}</strong> Total
                </span>
                <span
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--success)",
                  }}
                >
                  ✓ <strong>{contestStandingsData.registeredCount}</strong> Added in TFC
                </span>
                {contestStandingsData.unregisteredCount > 0 && (
                  <span
                    style={{
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.2)",
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#d97706",
                    }}
                  >
                    ⚠ <strong>{contestStandingsData.unregisteredCount}</strong> Unadded
                  </span>
                )}
              </div>
            )}

            <div style={{ width: "100%", maxWidth: 320, marginLeft: "auto" }}>
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search contestant, roll, handle..."
                  value={contestSearchQuery}
                  onChange={(e) => setContestSearchQuery(e.target.value)}
                />
                {contestSearchQuery && (
                  <button className="search-clear" onClick={() => setContestSearchQuery("")}>×</button>
                )}
              </div>
            </div>
          </div>

          {contestStandingsLoading && (
            <div className="empty-state">
              <div className="loading-spinner" />
              <p>Loading contest standings...</p>
            </div>
          )}

          {!contestStandingsLoading && contestStandingsError && (
            <div className="notice error">{contestStandingsError}</div>
          )}

          {!contestStandingsLoading && !contestStandingsError && displayedContestStandings.length === 0 && (
            <div className="empty-state">
              <p>{contestSearchQuery ? "No contestants match your search." : "No standings recorded for this contest."}</p>
            </div>
          )}

          {!contestStandingsLoading && !contestStandingsError && displayedContestStandings.length > 0 && (
            <div className="vjudge-table-container">
              <table className="vjudge-table">
                <thead>
                  <tr>
                    <th style={{ width: 65, textAlign: "center" }}>Rank</th>
                    <th>Team / Contestant</th>
                    <th style={{ width: 90, textAlign: "center" }}>Score</th>
                    <th style={{ width: 120, textAlign: "right" }}>Penalty</th>
                    <th style={{ width: 100, textAlign: "center" }}>Tries</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedContestStandings.slice(0, visibleContestCount).map((row, idx) => (
                    <tr
                      key={`${row.teamName}-${idx}`}
                      style={{ background: !row.isRegistered ? "rgba(245, 158, 11, 0.03)" : undefined }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <div
                          className={`vjudge-rank-badge ${
                            row.rank === 1 ? "rank-1" : row.rank === 2 ? "rank-2" : row.rank === 3 ? "rank-3" : "rank-other"
                          }`}
                        >
                          {row.rank === 1 ? "👑 1" : `#${row.rank}`}
                        </div>
                      </td>
                      <td>
                        {row.isRegistered ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                                {row.name}
                              </strong>
                              {row.batch && (
                                <span className="badge" style={{ padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                                  {normalizeBatch(row.batch) || row.batch}
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                Roll: {row.roll || "—"}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                              <a
                                href={`https://vjudge.net/user/${encodeURIComponent(row.teamName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="vjudge-handle-link"
                                title="Open VJudge user profile"
                              >
                                <span>VJ: {row.teamName}</span>
                                <span style={{ fontSize: 9 }}>↗</span>
                              </a>
                              {row.codeforcesHandle && (
                                <a
                                  href={`https://codeforces.com/profile/${encodeURIComponent(row.codeforcesHandle)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-secondary)",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                  }}
                                >
                                  CF: {row.codeforcesHandle} ↗
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <a
                                href={`https://vjudge.net/user/${encodeURIComponent(row.teamName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontWeight: 700,
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 14,
                                  color: "#d97706",
                                  textDecoration: "none",
                                }}
                                title="Open VJudge user profile"
                              >
                                {row.teamName} ↗
                              </a>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#d97706",
                                  background: "rgba(245, 158, 11, 0.12)",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  border: "1px solid rgba(245, 158, 11, 0.25)",
                                }}
                              >
                                Not Added Yet
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              VJudge Handle (not in TFC participant database)
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div className={`vjudge-solved-badge ${row.solved === 0 ? "zero" : ""}`}>
                          {row.solved}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="vjudge-penalty-text">
                          {Math.round(row.penalty).toLocaleString()}
                        </div>
                        <div className="vjudge-penalty-sub">
                          ({Math.floor(row.penalty / 60)}m)
                        </div>
                      </td>
                      <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        {row.submissions || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {displayedContestStandings.length > visibleContestCount && (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => setVisibleContestCount((c) => c + 50)}
                    style={{ fontWeight: 600 }}
                  >
                    Load More ({displayedContestStandings.length - visibleContestCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2: CONTESTANT RECORDINGS DIRECTORY
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "directory" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Recordings Directory</h2>
              <p className="card-subtitle">
                Browse contest screen recording playlists submitted by TFC contestants
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          {participants.length > 0 && (
            <div className="filter-bar">
              <BatchFilter
                options={availableBatches}
                selectedBatches={selectedBatches}
                onChange={setSelectedBatches}
              />
              <div style={{ width: "100%", maxWidth: 340 }}>
                <div className="search-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by contestant or roll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>×</button>}
                </div>
              </div>
            </div>
          )}

          {participantsLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading directory...</p></div>}
          {!participantsLoading && displayedParticipants.length === 0 && (
            <div className="empty-state"><p>No contestant recording directories found.</p></div>
          )}

          {!participantsLoading && displayedParticipants.length > 0 && (
            <div className="tfc-dir-grid" style={{ marginTop: 16 }}>
              {displayedParticipants.map((p) => (
                <div
                  key={p._id}
                  className="tfc-dir-card"
                  onClick={() => goToContestant(p._id)}
                >
                  <div className="tfc-dir-card-left">
                    <div className="tfc-dir-icon">📁</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="tfc-dir-name">{p.name}</div>
                      <div className="tfc-dir-sub">
                        <span>Roll: {p.roll}</span>
                        <span>·</span>
                        <span className="badge" style={{ padding: "1px 6px", fontSize: 10 }}>{normalizeBatch(p.batch) || p.batch}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {p.codeforcesHandle && (
                          <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>
                            CF: {p.codeforcesHandle}
                          </span>
                        )}
                        {p.vjudgeHandles && p.vjudgeHandles.length > 0 && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            VJ: {p.vjudgeHandles[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="tfc-dir-arrow">&gt;</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: CONSIDERED CONTESTS
          ════════════════════════════════════════════════════════════════════ */}
      {contestsModalOpen && (
        <div className="modal-overlay" onClick={() => setContestsModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Considered TFC Contests</h2>
                <p className="card-subtitle" style={{ margin: "2px 0 0" }}>
                  Contests counted towards TFC ratings. Click any contest to view its standings on VJudge.
                </p>
              </div>
              <button className="modal-close" onClick={() => setContestsModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: "16px 20px" }}>
              {contests.filter((c) => c.enabled !== false).length === 0 ? (
                <div className="empty-state"><p>No active TFC contests found.</p></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {contests.filter((c) => c.enabled !== false).map((c, idx) => (
                    <a
                      key={c._id || c.contestId}
                      href={`https://vjudge.net/contest/${c.contestId}#rank`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contest-link-item"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        textDecoration: "none",
                        transition: "all 0.15s ease",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", width: 22, textAlign: "right" }}>
                          {idx + 1}.
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.title || `TFC Contest #${c.contestId}`}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                            Contest ID: {c.contestId}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--primary)",
                        background: "rgba(37, 99, 235, 0.08)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        flexShrink: 0,
                      }}>
                        View Standings ↗
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setContestsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: TFC REGISTRATION FORM
          ════════════════════════════════════════════════════════════════════ */}
      {formModalOpen && (
        <div className="modal-overlay" onClick={() => { setFormModalOpen(false); resetForm(); }}>
          <div className="modal-content" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>TFC Registration Form</h2>
              <button className="modal-close" onClick={() => { setFormModalOpen(false); resetForm(); }}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: "78vh", overflowY: "auto", padding: "20px 24px" }}>
              {rDone ? (
                <div style={{ textAlign: "center", padding: "32px 16px 20px" }}>
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: "50%",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "2.5px solid #10b981",
                      color: "#10b981",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 34,
                      fontWeight: 800,
                      marginBottom: 16,
                      boxShadow: "0 4px 20px rgba(16, 185, 129, 0.25)",
                    }}
                  >
                    ✓
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: "#10b981", margin: "0 0 8px" }}>Done</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 24px", maxWidth: 420, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
                    Your TFC registration and playlist link have been submitted successfully and are pending admin approval.
                  </p>
                  <button
                    className="primary"
                    onClick={() => { setFormModalOpen(false); resetForm(); }}
                    style={{
                      minWidth: 130,
                      background: "#10b981",
                      borderColor: "#10b981",
                      color: "#ffffff",
                      fontWeight: 700,
                      boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    ✓ Done
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {rError && <div className="notice error">{rError}</div>}

                  {/* Section 1: Contestant Profile */}
                  <div style={{ background: "var(--bg-subtle)", padding: "14px 16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
                    <div className="tfc-form-section-title">
                      <span>👤 Contestant Profile</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div className="field">
                        <label>Full Name *</label>
                        <input
                          type="text"
                          value={rName}
                          onChange={(e) => setRName(e.target.value)}
                          placeholder="e.g. Tanvir Ahmed"
                          autoComplete="off"
                        />
                      </div>
                      <div className="field">
                        <label>Roll Number *</label>
                        <input
                          type="text"
                          value={rRoll}
                          onChange={(e) => setRRoll(e.target.value)}
                          placeholder="e.g. 2024045"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div className="field">
                        <label>Batch *</label>
                        <BatchSelect
                          key={`${formKey}-batch`}
                          value={rBatch}
                          onChange={setRBatch}
                          options={formBatchOptions}
                          placeholder="Select Batch *"
                        />
                      </div>
                      <div className="field">
                        <label>Codeforces Handle *</label>
                        <input
                          type="text"
                          value={rCfHandle}
                          onChange={(e) => setRCfHandle(e.target.value)}
                          placeholder="e.g. tourist"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Online Judges */}
                  <div style={{ background: "var(--bg-subtle)", padding: "14px 16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
                    <div className="tfc-form-section-title">
                      <span>🌐 Online Judge Handles</span>
                    </div>

                    <div className="field" style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <label style={{ margin: 0 }}>VJudge Handle(s) *</label>
                        <button
                          type="button"
                          className="secondary xs"
                          onClick={addVjudgeHandleField}
                          style={{ fontSize: 11, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          ＋ Add Another Handle
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {rVjudgeHandles.map((handle, idx) => (
                          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="text"
                              value={handle}
                              onChange={(e) => updateVjudgeHandleField(idx, e.target.value)}
                              placeholder={idx === 0 ? "Primary VJudge handle" : `Alternative handle ${idx + 1}`}
                              autoComplete="off"
                            />
                            {rVjudgeHandles.length > 1 && (
                              <button
                                type="button"
                                className="danger xs"
                                onClick={() => removeVjudgeHandleField(idx)}
                                style={{ padding: "8px 10px", borderRadius: "var(--radius)" }}
                                title="Remove handle"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Other Online Judges */}
                    <div className="field">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <label style={{ margin: 0 }}>Other OJ Handles (Optional)</label>
                        <button
                          type="button"
                          className="secondary xs"
                          onClick={addOtherOjRow}
                          style={{ fontSize: 11, padding: "2px 8px" }}
                        >
                          ＋ Add Other Platform
                        </button>
                      </div>
                      {rOtherOjs.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
                          (Optional: AtCoder, CSES, HackerRank, LightOJ, etc.)
                        </p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {rOtherOjs.map((oj, idx) => (
                            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                              <input
                                type="text"
                                value={oj.ojName}
                                onChange={(e) => updateOtherOjRow(idx, "ojName", e.target.value)}
                                placeholder="Platform (e.g. AtCoder)"
                              />
                              <input
                                type="text"
                                value={oj.handle}
                                onChange={(e) => updateOtherOjRow(idx, "handle", e.target.value)}
                                placeholder="Your handle"
                              />
                              <button
                                type="button"
                                className="danger xs"
                                onClick={() => removeOtherOjRow(idx)}
                                style={{ padding: "8px 10px", borderRadius: "var(--radius)" }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 3: Screen Recordings Playlist */}
                  <div style={{ background: "var(--bg-subtle)", padding: "14px 16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
                    <div className="tfc-form-section-title">
                      <span>📹 Screen Recordings</span>
                    </div>
                    <div className="field">
                      <label>YouTube Playlist Link *</label>
                      <input
                        type="url"
                        value={rPlaylistUrl}
                        onChange={(e) => setRPlaylistUrl(e.target.value)}
                        placeholder="https://www.youtube.com/playlist?list=..."
                        autoComplete="off"
                      />
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 14px",
                        background: "rgba(37, 99, 235, 0.06)",
                        border: "1px solid rgba(37, 99, 235, 0.18)",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: "var(--primary)", display: "block", marginBottom: 3 }}>
                        📋 Recording Guidelines:
                      </strong>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        <li>Create a YouTube playlist with your <strong>Roll Number</strong> as title.</li>
                        <li>Upload your contest recordings named in TFC format (e.g. <em>TFC-1</em>, <em>TFC-2</em>).</li>
                        <li>Set the videos and playlist as <strong>Unlisted</strong> (or Public) and paste the link here.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Section 4: Security Passkey */}
                  <div className="field">
                    <label>SGIPC Passkey *</label>
                    <input
                      type="password"
                      value={rPasskey}
                      onChange={(e) => setRPasskey(e.target.value)}
                      placeholder="Enter SGIPC passkey"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              )}
            </div>

            {!rDone && (
              <div className="modal-footer">
                <button className="secondary" onClick={() => setFormModalOpen(false)}>Cancel</button>
                <button className="primary" onClick={submitForm} disabled={rLoading}>
                  {rLoading ? "Submitting…" : "Submit TFC Request"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contest History Breakdown Modal */}
      <ContestHistoryModal
        isOpen={Boolean(contestHistoryTarget)}
        onClose={() => setContestHistoryTarget(null)}
        contestant={contestHistoryTarget}
      />
    </div>
  );
};

export default TfcCorner;
