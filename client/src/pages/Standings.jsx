import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getStandings,
  getVjudgeStandings,
  getInactiveStandings,
  submitHandleRequest,
  submitTeamRequest,
  submitReactivationRequest,
} from "../api.js";
import { BatchSelect } from "../components/BatchSelect.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getRatingLevel = (r) => {
  if (r < 1200) return { level: "Dead",          cls: "casual"      };
  if (r < 1400) return { level: "Warming Up",      cls: "warmup"      };
  if (r < 1800) return { level: "Persistent",      cls: "persistent"  };
  if (r < 2000) return { level: "Relentless",      cls: "relentless"  };
  if (r < 2400) return { level: "Unstoppable",      cls: "unstoppable" };
  if (r < 3000) return { level: "Problem Slayer",  cls: "slayer"      };
  return            { level: "👑 Practice Legend", cls: "legend"      };
};
const rankCls = (n) => n === 1 ? "gold" : n === 2 ? "silver" : n === 3 ? "bronze" : "default";

const extractBatchDigits = (b) => { const m = (b || "").match(/(\d{2})$/); return m ? m[1] : null; };
const normalizeBatch     = (b) => { const d = extractBatchDigits(b); return d ? `2K${d}` : null; };

export const computeBatchOptions = (standings = [], teamStandings = [], inactiveList = []) => {
  const digitsSet = new Set();
  const addFromStr = (str) => {
    const d = extractBatchDigits(str);
    if (d) {
      const num = parseInt(d, 10);
      if (!isNaN(num)) digitsSet.add(num);
    }
  };

  (standings || []).forEach((r) => addFromStr(r.batch));
  (teamStandings || []).forEach((t) => (t.members || []).forEach((m) => addFromStr(m.batch)));
  (inactiveList || []).forEach((r) => addFromStr(r.batch));

  let batchNumbers = Array.from(digitsSet);
  if (batchNumbers.length > 0) {
    const maxBatch = Math.max(...batchNumbers);
    const nextBatch = maxBatch + 1;
    digitsSet.add(nextBatch);
    batchNumbers = Array.from(digitsSet);
  } else {
    // Default fallback from known batches in system
    batchNumbers = [25, 24, 23, 22, 21, 20];
  }

  // Sort descending: most recent batches at top
  batchNumbers.sort((a, b) => b - a);

  // Format as 2K**
  return batchNumbers.map((n) => `2K${String(n).padStart(2, "0")}`);
};

// ─── Cache ────────────────────────────────────────────────────────────────────
const CACHE_VER   = "v4";
const CACHE_FRESH = 2  * 60 * 1000;   // 2 min stale-while-revalidate
const CACHE_MAX   = 30 * 60 * 1000;   // 30 min hard expiry

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.data) return null;
    const age = Date.now() - (p.timestamp || 0);
    if (age > CACHE_MAX) { localStorage.removeItem(key); return null; }
    return { ...p, isStale: p.version !== CACHE_VER || age > CACHE_FRESH };
  } catch { return null; }
};
const writeCache = (key, data) =>
  localStorage.setItem(key, JSON.stringify({ data, version: CACHE_VER, timestamp: Date.now() }));

// ─── Session Tab Persistence ──────────────────────────────────────────────────
const TAB_KEY = "sgipc_tab";
const getInitialTab = () => {
  try { return sessionStorage.getItem(TAB_KEY) || "individual"; } catch { return "individual"; }
};
const saveTab = (tab) => { try { sessionStorage.setItem(TAB_KEY, tab); } catch {} };

// ─── Team Ranking Types ───────────────────────────────────────────────────────
const TEAM_RANKING_TYPES = [
  {
    id: "normal",
    label: "Standard",
    description: "Standard performance rating based on head-to-head contest results",
  },
  {
    id: "gain-only",
    label: "Gain Only",
    description: "Performance ratings where teams only gain points without loss deductions",
  },
  {
    id: "zero-participation",
    label: "Participation Weighted",
    description: "Overall rankings factoring in both contest performance and active participation",
  },
];

// ─── Sort Indicator Component ────────────────────────────────────────────────
export const SortIcon = ({ active, direction }) => (
  <span
    className={`sort-icon ${active ? "active" : ""}`}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      marginLeft: 6,
      opacity: active ? 1 : 0.4,
      transition: "all 0.15s ease",
      height: 14,
      width: 10,
    }}
  >
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5 1L1.5 5H8.5L5 1Z"
        fill={active && direction === "asc" ? "var(--primary)" : "currentColor"}
        opacity={active && direction === "desc" ? 0.25 : 1}
      />
      <path
        d="M5 13L8.5 9H1.5L5 13Z"
        fill={active && direction === "desc" ? "var(--primary)" : "currentColor"}
        opacity={active && direction === "asc" ? 0.25 : 1}
      />
    </svg>
  </span>
);

// ─── Empty team member ────────────────────────────────────────────────────────
const emptyMember = () => ({ handle: "", name: "", roll: "", batch: "" });

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const Standings = () => {
  // ── Active view: individual | team | inactive ──────────────────────────────
  const [activeTab,  setActiveTab]  = useState(getInitialTab);
  const [showInactive, setShowInactive] = useState(false);   // slide-in panel inside individual

  const switchTab = (tab) => { setActiveTab(tab); saveTab(tab); setShowInactive(false); };
  const openInactive = () => { setShowInactive(true); saveTab("inactive_panel"); fetchInactive(); };
  const closeInactive = () => { setShowInactive(false); saveTab("individual"); };

  // Restore inactive panel state on mount
  useEffect(() => {
    const saved = getInitialTab();
    if (saved === "inactive_panel") {
      setActiveTab("individual");
      setShowInactive(true);
    }
  }, []);

  // ── Standings data ─────────────────────────────────────────────────────────
  const [standings,    setStandings]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [lastFetchAt,  setLastFetchAt]  = useState(null);

  // ── Team data ──────────────────────────────────────────────────────────────
  const [teamStandings,    setTeamStandings]    = useState([]);
  const [teamStandingsMap, setTeamStandingsMap] = useState({ normal: [], "gain-only": [], "zero-participation": [] });
  const [teamContests,     setTeamContests]     = useState([]);
  const [selectedTeamType, setSelectedTeamType] = useState("normal");
  const [teamLoading,      setTeamLoading]      = useState(true);
  const [teamError,        setTeamError]        = useState("");
  const [lastTeamFetchAt,  setLastTeamFetchAt]  = useState(null);
  const [contestsModalOpen, setContestsModalOpen] = useState(false);

  // ── Inactive data ──────────────────────────────────────────────────────────
  const [inactiveList,      setInactiveList]      = useState([]);
  const [inactiveLoading,   setInactiveLoading]   = useState(false);
  const [inactiveError,     setInactiveError]     = useState("");
  const [reactivatingHandle, setReactivatingHandle] = useState(null);
  const [reactivationMsg,   setReactivationMsg]   = useState({});

  // ── Filters ────────────────────────────────────────────────────────────────
  const [selectedBatches,  setSelectedBatches]  = useState([]);
  const [batchFilterOpen,  setBatchFilterOpen]  = useState(false);
  const [searchQuery,      setSearchQuery]      = useState("");

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [activityModal,  setActivityModal]  = useState(null);  // row data | null
  const [infoModal,      setInfoModal]      = useState(null);  // row data | null
  const [teamInfoModal,  setTeamInfoModal]  = useState(null);  // team row | null
  const [inactiveModal,  setInactiveModal]  = useState(null);  // inactive row | null
  const [requestModal,   setRequestModal]   = useState(false);
  const [requestTab,     setRequestTab]     = useState("handle");

  // ── Request form: individual ───────────────────────────────────────────────
  const [rHandle,  setRHandle]  = useState("");
  const [rName,    setRName]    = useState("");
  const [rRoll,    setRRoll]    = useState("");
  const [rBatch,   setRBatch]   = useState("");
  const [rPasskey, setRPasskey] = useState("");

  // ── Request form: team (3 members) ────────────────────────────────────────
  const emptyMember = () => ({ name: "", roll: "", batch: "" });
  const [rTeamName, setRTeamName] = useState("");
  const [rTeamVjudgeHandle, setRTeamVjudgeHandle] = useState("");
  const [rMembers,  setRMembers]  = useState([emptyMember(), emptyMember(), emptyMember()]);
  const [rTeamPasskey, setRTeamPasskey] = useState("");

  const [rError,    setRError]    = useState("");
  const [rSuccess,  setRSuccess]  = useState("");
  const [rDone,     setRDone]     = useState(false);
  const [rLoading,  setRLoading]  = useState(false);
  const [requestFormKey, setRequestFormKey] = useState(0);

  // ── Column Sorting State (ephemeral, resets on refresh) ────────────────────
  const [sortField, setSortField] = useState(null); // null | 'handle' | 'maxRating' | 'solvedCount' | 'standingRating'
  const [sortDir,   setSortDir]   = useState('desc');

  const handleSortClick = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir(field === 'handle' ? 'asc' : 'desc');
    }
  };

  const sortedStandings = useMemo(() => {
    if (!sortField) return standings;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...standings].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'handle') {
        valA = (a.name || a.handle || "").toLowerCase();
        valB = (b.name || b.handle || "").toLowerCase();
        return valA.localeCompare(valB) * dir;
      }
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      if (valA !== valB) return (valA - valB) * dir;
      if (b.standingRating !== a.standingRating) return b.standingRating - a.standingRating;
      return (b.maxRating || 0) - (a.maxRating || 0);
    });
  }, [standings, sortField, sortDir]);

  const availableBatches = useMemo(() => {
    const s = new Set();
    standings.forEach((r) => { const n = normalizeBatch(r.batch); if (n) s.add(n); });
    return Array.from(s).sort();
  }, [standings]);

  const formBatchOptions = useMemo(() => {
    return computeBatchOptions(standings, teamStandings, inactiveList);
  }, [standings, teamStandings, inactiveList]);

  const globalRankMap = useMemo(() => {
    const m = new Map();
    sortedStandings.forEach((r, i) => m.set(String(r.id), i + 1));
    return m;
  }, [sortedStandings]);

  const cfMaxRankMap = useMemo(() => {
    const m = new Map();
    const sortedByMax = [...standings].sort((a, b) => {
      if ((b.maxRating || 0) !== (a.maxRating || 0)) {
        return (b.maxRating || 0) - (a.maxRating || 0);
      }
      return (a.roll || "").localeCompare(b.roll || "", undefined, { numeric: true, sensitivity: "base" });
    });
    sortedByMax.forEach((r, i) => m.set(String(r.id), i + 1));
    return m;
  }, [standings]);

  const batchFiltered = useMemo(() => {
    if (!selectedBatches.length) return sortedStandings;
    return sortedStandings.filter((r) => {
      const d = extractBatchDigits(r.batch);
      return d && selectedBatches.some((b) => extractBatchDigits(b) === d);
    });
  }, [sortedStandings, selectedBatches]);

  const displayed = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return batchFiltered;
    return batchFiltered.filter(
      (r) =>
        (r.handle || "").toLowerCase().includes(q) ||
        (r.name   || "").toLowerCase().includes(q) ||
        (r.roll   || "").toLowerCase().includes(q)
    );
  }, [batchFiltered, searchQuery]);

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchStandings = useCallback(async () => {
    try {
      const data = await getStandings();
      setStandings(data);
      setLastUpdated(new Date());
      setLastFetchAt(Date.now());
      setError("");
      writeCache("indStandings", data);
      return true;
    } catch { return false; }
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const data = await getVjudgeStandings();
      if (data.standingsByType) {
        setTeamStandingsMap(data.standingsByType);
      }
      setTeamStandings(data.standings || []);
      setTeamContests(data.contests || []);
      setTeamError("");
      setLastTeamFetchAt(Date.now());
      writeCache("teamStandings", data);
      return true;
    } catch { return false; }
  }, []);

  const fetchInactive = useCallback(async () => {
    setInactiveLoading(true);
    setInactiveError("");
    try {
      const data = await getInactiveStandings();
      setInactiveList(data);
    } catch {
      setInactiveError("Unable to load inactive accounts.");
    } finally {
      setInactiveLoading(false);
    }
  }, []);

  // ── Initial load (Stale-While-Revalidate pattern) ──────────────────────────
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const c = readCache("indStandings");
      if (c) {
        setStandings(c.data);
        setLastUpdated(new Date(c.timestamp));
        setLoading(false);
      }
      const ok = await fetchStandings();
      if (alive && !ok && !c) setError("Unable to load standings.");
      if (alive) setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [fetchStandings]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const c = readCache("teamStandings");
      if (c) {
        if (c.data?.standingsByType) {
          setTeamStandingsMap(c.data.standingsByType);
        }
        setTeamStandings(c.data?.standings || []);
        if (c.data?.contests) {
          setTeamContests(c.data.contests);
        }
        setTeamLoading(false);
      }
      const ok = await fetchTeam();
      if (alive && !ok && !c) setTeamError("Unable to load team standings.");
      if (alive) setTeamLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [fetchTeam]);

  // Load inactive when the panel is opened
  useEffect(() => {
    if (showInactive) fetchInactive();
  }, [showInactive, fetchInactive]);

  // Refetch on focus
  useEffect(() => {
    const onFocus = () => {
      if (!lastFetchAt    || Date.now() - lastFetchAt    > CACHE_FRESH) fetchStandings();
      if (!lastTeamFetchAt|| Date.now() - lastTeamFetchAt> CACHE_FRESH) fetchTeam();
    };
    const onVis = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [lastFetchAt, lastTeamFetchAt, fetchStandings, fetchTeam]);

  // ── Request form helpers ───────────────────────────────────────────────────
  const resetRequestForm = () => {
    setRHandle(""); setRName(""); setRRoll(""); setRBatch(""); setRPasskey("");
    setRTeamName(""); setRTeamVjudgeHandle(""); setRMembers([emptyMember(), emptyMember(), emptyMember()]); setRTeamPasskey("");
    setRError(""); setRSuccess(""); setRDone(false);
    setRequestFormKey((k) => k + 1);
  };
  const openRequestModal = () => { resetRequestForm(); setRequestTab("handle"); setRequestModal(true); };

  const updateMember = (idx, field, val) =>
    setRMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));

  const submitRequest = async () => {
    setRError(""); setRSuccess("");
    if (rLoading) return;

    const BATCH_REGEX = /^2K\d{2}$/i;

    if (requestTab === "handle") {
      if (!rHandle.trim() || !rName.trim() || !rRoll.trim() || !rBatch.trim() || !rPasskey.trim())
        return setRError("All fields are required.");
      if (!BATCH_REGEX.test(rBatch.trim()))
        return setRError("Batch must be in the format 2K** (e.g. 2K22).");
    } else {
      if (!rTeamName.trim() || !rTeamVjudgeHandle.trim() || !rTeamPasskey.trim())
        return setRError("Team name, VJudge handle, and passkey are required.");
      for (let i = 0; i < 3; i++) {
        const m = rMembers[i];
        if (!m.name.trim() || !m.roll.trim() || !m.batch.trim())
          return setRError(`All fields (Name, Roll, Batch) for Member ${i + 1} are required.`);
        if (!BATCH_REGEX.test(m.batch.trim()))
          return setRError(`Batch for Member ${i + 1} must be in the format 2K** (e.g. 2K22).`);
      }
    }
    setRLoading(true);
    try {
      if (requestTab === "handle") {
        await submitHandleRequest({
          handle: rHandle.trim(),
          name: rName.trim(),
          roll: rRoll.trim(),
          batch: rBatch.trim().toUpperCase(),
          passkey: rPasskey.trim(),
        });
      } else {
        await submitTeamRequest({
          teamName: rTeamName.trim(),
          teamVjudgeHandle: rTeamVjudgeHandle.trim(),
          members: rMembers.map((m) => ({
            name: m.name.trim(),
            roll: m.roll.trim(),
            batch: m.batch.trim().toUpperCase(),
          })),
          passkey: rTeamPasskey.trim(),
        });
      }
      setRDone(true);
      setRSuccess("Request submitted successfully!");
      setRHandle(""); setRName(""); setRRoll(""); setRBatch(""); setRPasskey("");
      setRTeamName(""); setRTeamVjudgeHandle(""); setRMembers([emptyMember(), emptyMember(), emptyMember()]); setRTeamPasskey("");
      setRequestFormKey((k) => k + 1);
    } catch (err) {
      setRError(err?.response?.data?.message || "Unable to submit request.");
    } finally {
      setRLoading(false);
    }
  };

  // ── Reactivation ───────────────────────────────────────────────────────────
  const handleReactivate = async (handle) => {
    setReactivatingHandle(handle);
    try {
      await submitReactivationRequest(handle);
      setReactivationMsg((p) => ({ ...p, [handle]: { ok: true, text: "Request submitted! Pending admin approval." } }));
    } catch (err) {
      setReactivationMsg((p) => ({ ...p, [handle]: { ok: false, text: err?.response?.data?.message || "Failed." } }));
    } finally {
      setReactivatingHandle(null);
    }
  };

  const toggleBatch = (b) =>
    setSelectedBatches((p) => (p.includes(b) ? p.filter((x) => x !== b) : [...p, b]));

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="container">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-inner" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="badge">SGIPC · Competitive Programming</span>
            <h1>Practice <span className="accent">Standings</span></h1>
            <p>Live rankings from Codeforces practice &amp; VJudge contests</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
              <button className="primary sm" onClick={openRequestModal}>＋ Request to Join</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16 }}>
            <Link to="/tfc" className="tfc-corner-btn-red" title="Go to Team Formation Contest Corner">
              <span>Go to TFC Corner</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" />
              </svg>
            </Link>
            <img src="/logo.png" alt="SGIPC" className="hero-logo" />
          </div>
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div className="tabs">
        <button className={`tab ${activeTab === "individual" && !showInactive ? "active" : ""}`} onClick={() => switchTab("individual")}>
          🏆 Individual
        </button>
        <button className={`tab ${activeTab === "team" ? "active" : ""}`} onClick={() => switchTab("team")}>
          👥 Team
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          INDIVIDUAL STANDINGS  (or Inactive Panel inside it)
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "individual" && !showInactive && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Individual Rankings</h2>
              <p className="card-subtitle">Practice rating based on Codeforces solved problems</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {lastUpdated && (
                <span className="text-xs text-muted">Updated {lastUpdated.toLocaleTimeString()}</span>
              )}
              <button
                className="secondary sm"
                onClick={openInactive}
                title="View inactive accounts"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                💤 Inactive
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          {!loading && standings.length > 0 && (
            <div className="filter-bar">
              <div className="filter-section">
                <button
                  className={`secondary sm`}
                  onClick={() => setBatchFilterOpen(!batchFilterOpen)}
                >
                  🎓 Batch{selectedBatches.length > 0 && (
                    <span style={{ marginLeft: 5, background: "var(--primary)", color: "#fff", borderRadius: "999px", padding: "0px 6px", fontSize: 10, fontWeight: 700 }}>
                      {selectedBatches.length}
                    </span>
                  )}
                </button>
                {selectedBatches.map((b) => (
                  <span key={b} className="batch-tag" onClick={() => toggleBatch(b)}>
                    {b} <span>×</span>
                  </span>
                ))}
                {selectedBatches.length > 0 && (
                  <button className="secondary sm" onClick={() => setSelectedBatches([])}>Clear</button>
                )}
              </div>
              <div style={{ width: "100%", maxWidth: 340 }}>
                <div className="search-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search handle, name or roll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>×</button>}
                </div>
                {searchQuery && (
                  <p className="text-xs text-muted" style={{ marginTop: 3, textAlign: "right" }}>
                    {displayed.length} result{displayed.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Batch dropdown */}
          {batchFilterOpen && availableBatches.length > 0 && (
            <div className="batch-dropdown">
              {availableBatches.map((b) => (
                <label key={b} className={`batch-checkbox-label ${selectedBatches.includes(b) ? "selected" : ""}`}>
                  <input type="checkbox" checked={selectedBatches.includes(b)} onChange={() => toggleBatch(b)} style={{ width: "auto", accentColor: "var(--primary)" }} />
                  {b}
                </label>
              ))}
            </div>
          )}

          {loading && <div className="empty-state"><div className="loading-spinner" /><p>Loading standings...</p></div>}
          {!loading && error && <div className="notice error">{error}</div>}
          {!loading && !error && standings.length === 0 && <div className="empty-state"><p>No participants yet.</p></div>}

          {!loading && standings.length > 0 && (
            <>
              {/* Legend */}
              <div className="rating-legend">
                <strong>Tiers:</strong>
                {[
                  { cls: "casual",      label: "<1200 Casual"          },
                  { cls: "warmup",      label: "<1400 Warming Up"      },
                  { cls: "persistent",  label: "<1800 Persistent"      },
                  { cls: "relentless",  label: "<2000 Relentless"      },
                  { cls: "unstoppable", label: "<2400 Unstoppable"      },
                  { cls: "slayer",      label: "<3000 Problem Slayer"  },
                  { cls: "legend",      label: "≥3000 Practice Legend" },
                ].map(({ cls, label }) => (
                  <div key={cls} className="legend-item">
                    <div className={`legend-color ${cls}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("handle")}>
                      Handle / Name <SortIcon active={sortField === "handle"} direction={sortDir} />
                    </th>
                    <th style={{ width: 105, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("maxRating")}>
                      CF Max <SortIcon active={sortField === "maxRating"} direction={sortDir} />
                    </th>
                    <th style={{ width: 85, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("solvedCount")}>
                      Solved <SortIcon active={sortField === "solvedCount"} direction={sortDir} />
                    </th>
                    <th style={{ width: 165, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("standingRating")}>
                      Practice Rating <SortIcon active={sortField === "standingRating"} direction={sortDir} />
                    </th>
                    <th style={{ width: 60, textAlign: "center" }}>Info</th>
                    <th style={{ width: 90, textAlign: "center" }}>Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((row) => {
                    const gRank = globalRankMap.get(String(row.id)) ?? 0;
                    const { level, cls } = getRatingLevel(row.standingRating);
                    return (
                      <tr key={row.id}>
                        <td data-label="#">
                          <div className={`rank-badge ${rankCls(gRank)}`}>{gRank}</div>
                        </td>
                        <td data-label="Handle">
                          <a href={`https://codeforces.com/profile/${row.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">
                            {row.handle}
                          </a>
                          {(row.name || row.batch) && (
                            <div className="handle-sub">
                              {row.name && <span>{row.name}</span>}
                              {row.name && row.batch && " · "}
                              {row.batch && <span className="text-mono" style={{ fontSize: 11 }}>{normalizeBatch(row.batch) || row.batch}</span>}
                            </div>
                          )}
                        </td>
                        <td data-label="CF Max">
                          <span className="stat-badge rating">{row.maxRating || "—"}</span>
                        </td>
                        <td data-label="Solved">
                          <span className="stat-badge solved">{row.solvedCount}</span>
                        </td>
                        <td data-label="Practice Rating">
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                              {row.standingRating}
                            </span>
                            <span className={`rating-level ${cls}`}>{level}</span>
                          </div>
                        </td>
                        <td data-label="Info" style={{ textAlign: "center" }}>
                          <button className="icon-btn" onClick={() => setInfoModal(row)} title="View details">
                            👁
                          </button>
                        </td>
                        <td data-label="Activity" style={{ textAlign: "center" }}>
                          <button className="secondary sm" onClick={() => setActivityModal(row)}>
                            Activity
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          INACTIVE ACCOUNTS PANEL (inside individual tab)
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "individual" && showInactive && (
        <div className="inactive-panel">
          <div className="inactive-panel-header">
            <div className="inactive-panel-title">
              <button className="back-btn" onClick={closeInactive}>
                ← Back to Standings
              </button>
              <div style={{ width: 1, height: 18, background: "var(--border)" }} />
              <h2>Inactive Accounts</h2>
              <span className="inactive-badge">💤 No solves in 90 days</span>
            </div>
            <button className="secondary sm" onClick={fetchInactive}>↻ Refresh</button>
          </div>

          <div className="notice info" style={{ marginBottom: 16 }}>
            These accounts have no Codeforces activity in the last 90 days and are excluded from active rankings.
            You can apply for reactivation — the admin will review and approve it.
          </div>

          {inactiveLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading...</p></div>}
          {!inactiveLoading && inactiveError && <div className="notice error">{inactiveError}</div>}
          {!inactiveLoading && !inactiveError && inactiveList.length === 0 && (
            <div className="empty-state"><p>🎉 No inactive accounts — everyone is active!</p></div>
          )}
          {!inactiveLoading && !inactiveError && inactiveList.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Handle</th>
                  <th style={{ width: 100 }}>CF Max</th>
                  <th style={{ width: 90 }}>Total Solved</th>
                  <th style={{ width: 120 }}>Inactive Since</th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 160 }}>Reactivation</th>
                </tr>
              </thead>
              <tbody>
                {inactiveList.map((row, idx) => {
                  const msg = reactivationMsg[row.handle];
                  const inactiveSince = row.inactiveSince
                    ? new Date(row.inactiveSince).toLocaleDateString()
                    : "—";
                  return (
                    <tr key={row.id}>
                      <td data-label="#" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 13 }}>
                        {idx + 1}
                      </td>
                      <td data-label="Handle">
                        <a href={`https://codeforces.com/profile/${row.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">
                          {row.handle}
                        </a>
                        {(row.name || row.batch) && (
                          <div className="handle-sub">
                            {row.name && <span>{row.name}</span>}
                            {row.name && row.batch && " · "}
                            {row.batch && <span className="text-mono" style={{ fontSize: 11 }}>{normalizeBatch(row.batch) || row.batch}</span>}
                          </div>
                        )}
                      </td>
                      <td data-label="CF Max"><span className="stat-badge rating">{row.maxRating || "—"}</span></td>
                      <td data-label="Total Solved"><span className="stat-badge solved">{row.totalSolved}</span></td>
                      <td data-label="Inactive Since"><span className="inactive-since">{inactiveSince}</span></td>
                      <td data-label="Info" style={{ textAlign: "center" }}>
                        <button className="icon-btn" onClick={() => setInactiveModal(row)} title="View details">
                          👁
                        </button>
                      </td>
                      <td data-label="Reactivation">
                        {msg ? (
                          <span style={{ fontSize: 12, color: msg.ok ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
                            {msg.text}
                          </span>
                        ) : (
                          <button
                            className="btn-reactivate"
                            disabled={reactivatingHandle === row.handle}
                            onClick={() => handleReactivate(row.handle)}
                          >
                            {reactivatingHandle === row.handle ? "Sending…" : "Apply to Reactivate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TEAM STANDINGS
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "team" && (
        <div className="card">
          <div className="card-header" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h2>Team Rankings</h2>
              <p className="card-subtitle">
                {TEAM_RANKING_TYPES.find((t) => t.id === selectedTeamType)?.description || "VJudge contest performance rankings"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                className="secondary sm"
                onClick={() => setContestsModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                📜 Considered Contests ({teamContests.filter((c) => c.enabled !== false).length})
              </button>
              {/* 3 Type Options */}
              <div style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-subtle)",
                padding: 4,
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)",
                flexWrap: "wrap"
              }}>
                {TEAM_RANKING_TYPES.map((t) => {
                  const isActive = selectedTeamType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTeamType(t.id)}
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
                        boxShadow: isActive ? "0 2px 8px rgba(37, 99, 235, 0.25)" : "none"
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {teamLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading team standings...</p></div>}
          {!teamLoading && teamError && <div className="notice error">{teamError}</div>}
          {!teamLoading && !teamError && (teamStandingsMap[selectedTeamType] || teamStandings).length === 0 && <div className="empty-state"><p>No team standings yet.</p></div>}
          {!teamLoading && !teamError && (teamStandingsMap[selectedTeamType] || teamStandings).length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Team Name</th>
                  <th style={{ width: 100 }}>Contests</th>
                  <th style={{ width: 130 }}>Rating</th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                </tr>
              </thead>
              <tbody>
                {(teamStandingsMap[selectedTeamType] || teamStandings).map((row) => (
                  <tr key={row.id}>
                    <td data-label="#"><div className={`rank-badge ${rankCls(row.rank)}`}>{row.rank}</div></td>
                    <td data-label="Team Name">
                      <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{row.name}</span>
                      {((row.members && row.members.length > 0) || (row.aliases && row.aliases.length > 0)) && (
                        <div className="handle-sub" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {row.members && row.members.length > 0
                            ? row.members.map((m) => m.name).filter(Boolean).join(" · ")
                            : row.aliases.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td data-label="Contests" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {row.contests}
                    </td>
                    <td data-label="Rating">
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)", fontSize: 15 }}>
                        {row.ratingDisplay}
                      </span>
                    </td>
                    <td data-label="Info" style={{ textAlign: "center" }}>
                      <button className="icon-btn" onClick={() => setTeamInfoModal(row)} title="View team details">
                        👁
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          REQUEST MODAL
          ════════════════════════════════════════════════════════════════════ */}
      {requestModal && (
        <div className="modal-overlay" onClick={() => setRequestModal(false)}>
          <div className="modal-content" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request to Join Standings</h2>
              <button className="modal-close" onClick={() => setRequestModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {rDone ? (
                <div style={{ textAlign: "center", padding: "28px 16px 16px" }}>
                  <div style={{
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
                    boxShadow: "0 4px 20px rgba(16, 185, 129, 0.25)"
                  }}>
                    ✓
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: "#10b981", margin: "0 0 8px" }}>Done</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
                    Your request to join standings has been submitted successfully and is pending admin approval.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setRequestModal(false)}
                    style={{
                      minWidth: 130,
                      background: "#10b981",
                      borderColor: "#10b981",
                      color: "#ffffff",
                      fontWeight: 700,
                      boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)"
                    }}
                  >
                    ✓ Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Tab switcher */}
                  <div className="tabs" style={{ marginBottom: 18 }}>
                    <button className={`tab ${requestTab === "handle" ? "active" : ""}`} onClick={() => { setRequestTab("handle"); setRError(""); setRSuccess(""); }}>Individual</button>
                    <button className={`tab ${requestTab === "team" ? "active" : ""}`} onClick={() => { setRequestTab("team"); setRError(""); setRSuccess(""); }}>Team</button>
                  </div>

                  {rError && <div className="notice error" style={{ marginBottom: 14 }}>{rError}</div>}
                  {rSuccess && <div className="notice success" style={{ marginBottom: 14 }}>{rSuccess}</div>}

                  {/* Individual form */}
                  {requestTab === "handle" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div className="field" style={{ gridColumn: "1 / -1" }}>
                        <label>Codeforces Handle *</label>
                        <input type="text" value={rHandle} onChange={(e) => setRHandle(e.target.value)} placeholder="e.g. tourist" autoComplete="off" />
                      </div>
                      <div className="field">
                        <label>Full Name *</label>
                        <input type="text" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Your name" autoComplete="off" />
                      </div>
                      <div className="field">
                        <label>Roll Number *</label>
                        <input type="text" value={rRoll} onChange={(e) => setRRoll(e.target.value)} placeholder="e.g. 2024001" autoComplete="off" />
                      </div>
                      <div className="field">
                        <label>Batch *</label>
                        <BatchSelect
                          key={`${requestFormKey}-indiv`}
                          value={rBatch}
                          onChange={setRBatch}
                          options={formBatchOptions}
                          placeholder="Select Batch *"
                        />
                      </div>
                      <div className="field">
                        <label>SGIPC Passkey *</label>
                        <input type="password" value={rPasskey} onChange={(e) => setRPasskey(e.target.value)} placeholder="Passkey" autoComplete="new-password" />
                      </div>
                    </div>
                  )}

                  {/* Team form — 3 members */}
                  {requestTab === "team" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div className="field">
                        <label>Team Name *</label>
                        <input type="text" value={rTeamName} onChange={(e) => setRTeamName(e.target.value)} placeholder="Team name (e.g. KUET_Alpha)" autoComplete="off" />
                      </div>

                      <div className="field">
                        <label>VJudge Team Handle *</label>
                        <input type="text" value={rTeamVjudgeHandle} onChange={(e) => setRTeamVjudgeHandle(e.target.value)} placeholder="Team VJudge handle for rankings" autoComplete="off" />
                      </div>

                      {[0, 1, 2].map((i) => (
                        <div key={i} className="member-section">
                          <div className="member-section-label">Member {i + 1}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                            <div className="field">
                              <label>Full Name *</label>
                              <input type="text" value={rMembers[i].name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Full name" autoComplete="off" />
                            </div>
                            <div className="field">
                              <label>Roll Number *</label>
                              <input type="text" value={rMembers[i].roll} onChange={(e) => updateMember(i, "roll", e.target.value)} placeholder="Roll" autoComplete="off" />
                            </div>
                            <div className="field">
                              <label>Batch *</label>
                              <BatchSelect
                                key={`${requestFormKey}-team-${i}`}
                                value={rMembers[i].batch}
                                onChange={(val) => updateMember(i, "batch", val)}
                                options={formBatchOptions}
                                placeholder="Select Batch *"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="field">
                        <label>SGIPC Passkey *</label>
                        <input type="password" value={rTeamPasskey} onChange={(e) => setRTeamPasskey(e.target.value)} placeholder="Passkey" autoComplete="new-password" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {!rDone && (
              <div className="modal-footer">
                <button className="secondary" onClick={() => setRequestModal(false)}>Cancel</button>
                <button className="primary" onClick={submitRequest} disabled={rLoading}>
                  {rLoading ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          INFO MODAL (individual)
          ════════════════════════════════════════════════════════════════════ */}
      {infoModal && (
        <div className="modal-overlay" onClick={() => setInfoModal(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Participant Details</h2>
              <button className="modal-close" onClick={() => setInfoModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Handle",                <a href={`https://codeforces.com/profile/${infoModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{infoModal.handle}</a>],
                ["Name",                  infoModal.name  || "Not provided"],
                ["Roll",                  infoModal.roll  || "Not provided"],
                ["Batch",                 normalizeBatch(infoModal.batch) || infoModal.batch || "Not provided"],
                ["CF Max Rating",         <span className="stat-badge rating">{infoModal.maxRating || "—"}</span>],
                ["Practice Rating",       <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{infoModal.standingRating}</span>],
                ["Global Rank (Practice)",<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>#{globalRankMap.get(String(infoModal.id)) ?? "?"}</span>],
                ["Global Rank (CF Max)",  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--warning)" }}>#{cfMaxRankMap.get(String(infoModal.id)) ?? "?"}</span>],
              ].map(([label, value]) => (
                <div key={label} className="detail-row">
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setInfoModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TEAM INFO MODAL
          ════════════════════════════════════════════════════════════════════ */}
      {teamInfoModal && (
        <div className="modal-overlay" onClick={() => setTeamInfoModal(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Team Details</h2>
              <button className="modal-close" onClick={() => setTeamInfoModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Team Name", teamInfoModal.name],
                ["VJudge Handle", (teamInfoModal.aliases || []).join(", ") || "—"],
                ["Rating", <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>{teamInfoModal.ratingDisplay}</span>],
                ["Contests Participated", teamInfoModal.contests || 0],
              ].map(([label, value]) => (
                <div key={label} className="detail-row">
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Team Members
                </h3>
                {teamInfoModal.members && teamInfoModal.members.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {teamInfoModal.members.map((m, idx) => (
                      <div key={idx} style={{ background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name || `Member ${idx + 1}`}</div>
                          {m.roll && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Roll: {m.roll}</div>}
                        </div>
                        {m.batch && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                            {normalizeBatch(m.batch) || m.batch}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No member details recorded.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setTeamInfoModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          INACTIVE DETAIL MODAL
          ════════════════════════════════════════════════════════════════════ */}
      {inactiveModal && (
        <div className="modal-overlay" onClick={() => setInactiveModal(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Inactive Account Details</h2>
              <button className="modal-close" onClick={() => setInactiveModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Handle",               <a href={`https://codeforces.com/profile/${inactiveModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{inactiveModal.handle}</a>],
                ["Name",                 inactiveModal.name  || "Not provided"],
                ["Batch",                normalizeBatch(inactiveModal.batch) || inactiveModal.batch || "Not provided"],
                ["CF Max Rating",        <span className="stat-badge rating">{inactiveModal.maxRating || "—"}</span>],
                ["Global Rank (CF Max)", <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--warning)" }}>#{cfMaxRankMap.get(String(inactiveModal.id)) ?? "?"}</span>],
                ["Total Solved",         <span className="stat-badge solved">{inactiveModal.totalSolved}</span>],
                ["Inactive Since",       inactiveModal.inactiveSince ? new Date(inactiveModal.inactiveSince).toLocaleDateString() : "Unknown"],
                ["Status",               <span className="inactive-badge">💤 Inactive</span>],
              ].map(([label, value]) => (
                <div key={label} className="detail-row">
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setInactiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ACTIVITY MODAL
          ════════════════════════════════════════════════════════════════════ */}
      {activityModal && (
        <div className="modal-overlay" onClick={() => setActivityModal(null)}>
          <div className="modal-content" style={{ maxWidth: 540, maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{activityModal.handle}</h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Recent 5-day activity</p>
              </div>
              <button className="modal-close" onClick={() => setActivityModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {(!activityModal.recentStats || activityModal.recentStats.length === 0) ? (
                <div className="empty-state" style={{ padding: "24px 0" }}><p>No recent activity data.</p></div>
              ) : (
                activityModal.recentStats.map((day) => (
                  <div key={day.date} className="day-block">
                    <div className="day-header">
                      <span className="date-label">{day.date}</span>
                      <div className="delta-block">
                        <span className="delta-meta">{day.fromRating} → {day.toRating}</span>
                        <span className={day.delta >= 0 ? "delta-positive" : "delta-negative"}>
                          {day.delta >= 0 ? "+" : ""}{day.delta}
                        </span>
                      </div>
                    </div>
                    {day.problems.length === 0 ? (
                      <p className="day-empty">No rated problems solved.</p>
                    ) : (
                      <ul className="problem-list">
                        {day.problems.map((p, idx) => (
                          <li key={`${p.contestId}-${p.index}-${idx}`}>
                            <strong>{p.name}</strong> — ★ {p.rating}
                          </li>
                        ))}
                      </ul>
                    )}
                    {day.pendingCount > 0 && (
                      <p className="day-empty" style={{ marginTop: 6, color: "var(--warning)" }}>
                        ⏳ {day.pendingCount} pending unrated problem{day.pendingCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setActivityModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* ════════════════════════════════════════════════════════════════════
          MODAL: CONSIDERED CONTESTS (TEAM)
          ════════════════════════════════════════════════════════════════════ */}
      {contestsModalOpen && (
        <div className="modal-overlay" onClick={() => setContestsModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Considered Contests</h2>
                <p className="card-subtitle" style={{ margin: "2px 0 0" }}>
                  Contests counted in team standings. Click any contest to open its standings on VJudge.
                </p>
              </div>
              <button className="modal-close" onClick={() => setContestsModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: "16px 20px" }}>
              {teamContests.filter((c) => c.enabled !== false).length === 0 ? (
                <div className="empty-state"><p>No active contests counted yet.</p></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {teamContests.filter((c) => c.enabled !== false).map((c, idx) => (
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
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          width: 22,
                          textAlign: "right",
                          flexShrink: 0
                        }}>
                          {idx + 1}.
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}>
                            {c.title || `Contest #${c.contestId}`}
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
                        flexShrink: 0
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
    </div>
  );
};

export default Standings;
