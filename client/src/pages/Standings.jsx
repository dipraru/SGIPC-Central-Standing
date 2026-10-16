import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  getStandings,
  getVjudgeStandings,
  getInactiveStandings,
  submitHandleRequest,
  submitTeamRequest,
  submitReactivationRequest,
  syncHandle,
} from "../api.js";
import { ActivityHistoryModal } from "../components/ActivityHistoryModal.jsx";

// ─── Rating Tiers & Helpers ──────────────────────────────────────────────────
export const getRatingLevel = (r) => {
  if (r < 1200) return { level: "Dead", cls: "casual", color: "var(--tier-dead, #94a3b8)" };
  if (r < 1400) return { level: "Warming Up", cls: "warmup", color: "var(--tier-warmup, #38bdf8)" };
  if (r < 1800) return { level: "Persistent", cls: "persistent", color: "var(--tier-persistent, #818cf8)" };
  if (r < 2000) return { level: "Relentless", cls: "relentless", color: "var(--tier-relentless, #fbbf24)" };
  if (r < 2400) return { level: "Unstoppable", cls: "unstoppable", color: "var(--tier-unstoppable, #f87171)" };
  if (r < 3000) return { level: "Problem Slayer", cls: "slayer", color: "var(--tier-slayer, #eab308)" };
  return { level: "👑 Practice Legend", cls: "legend", color: "var(--tier-legend, #f43f5e)" };
};

const extractBatchDigits = (b) => {
  const m = (b || "").match(/(\d{2})$/);
  return m ? m[1] : null;
};
const normalizeBatch = (b) => {
  const d = extractBatchDigits(b);
  return d ? `2K${d}` : null;
};

export const getBatchesFromList = (items = [], extractor) => {
  const digitsSet = new Set();
  (items || []).forEach((item) => {
    const batches = extractor(item);
    (batches || []).forEach((b) => {
      const d = extractBatchDigits(b);
      if (d) {
        const num = parseInt(d, 10);
        if (!isNaN(num)) digitsSet.add(num);
      }
    });
  });
  const sorted = Array.from(digitsSet).sort((a, b) => b - a);
  return sorted.map((n) => `2K${String(n).padStart(2, "0")}`);
};

export const computeJoinBatchOptions = (standings = [], teamStandings = []) => {
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

  const batchNumbers = Array.from(digitsSet);
  const maxBatch = batchNumbers.length > 0 ? Math.max(...batchNumbers) : 25;
  const topBatch = maxBatch + 1;
  const options = [];
  for (let i = 0; i < 5; i++) {
    options.push(`2K${String(topBatch - i).padStart(2, "0")}`);
  }
  return options;
};

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
    digitsSet.add(maxBatch + 1);
    batchNumbers = Array.from(digitsSet);
  } else {
    batchNumbers = [25, 24, 23, 22, 21, 20];
  }

  batchNumbers.sort((a, b) => b - a);
  return batchNumbers.map((n) => `2K${String(n).padStart(2, "0")}`);
};

export const SortIcon = ({ col, activeCol, dir }) => {
  const isActive = col === activeCol;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 6,
        opacity: isActive ? 1 : 0.35,
        transition: "opacity 0.15s ease",
      }}
    >
      {isActive ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
};

const emptyMember = () => ({ handle: "", name: "", roll: "", batch: "", batchSelect: "", customDigits: "" });

export default function Standings() {
  const [activeTab, setActiveTab] = useState("individual"); // 'individual' | 'team' | 'inactive'
  const [showInactive, setShowInactive] = useState(false);

  // Theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("sgipc_theme") || "dark";
  });

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("sgipc_theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Data states
  const [standings, setStandings] = useState([]);
  const [teamStandings, setTeamStandings] = useState([]);
  const [inactiveList, setInactiveList] = useState([]);
  const [individualLoading, setIndividualLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inactiveLoading, setInactiveLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [othersCustomDigits, setOthersCustomDigits] = useState("");
  const othersRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (othersRef.current && !othersRef.current.contains(e.target)) {
        setOthersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Syncing individual handle state
  const [syncingHandle, setSyncingHandle] = useState(null);

  // Modals state
  const [requestModal, setRequestModal] = useState(false);
  const [requestTab, setRequestTab] = useState("handle"); // 'handle' | 'team'
  const [historyTarget, setHistoryTarget] = useState(null);
  const [teamHistoryTarget, setTeamHistoryTarget] = useState(null);
  const [teamContests, setTeamContests] = useState([]);
  const [contestsModalOpen, setContestsModalOpen] = useState(false);

  // Request Form States
  const [rHandle, setRHandle] = useState("");
  const [rName, setRName] = useState("");
  const [rRoll, setRRoll] = useState("");
  const [rBatch, setRBatch] = useState("");
  const [rBatchSelect, setRBatchSelect] = useState("");
  const [rCustomBatchDigits, setRCustomBatchDigits] = useState("");
  const [rPasskey, setRPasskey] = useState("");

  const [rTeamName, setRTeamName] = useState("");
  const [rTeamVjudgeHandle, setRTeamVjudgeHandle] = useState("");
  const [rMembers, setRMembers] = useState([emptyMember(), emptyMember(), emptyMember()]);
  const [rTeamPasskey, setRTeamPasskey] = useState("");

  const [rLoading, setRLoading] = useState(false);
  const [rError, setRError] = useState("");
  const [rSuccess, setRSuccess] = useState("");

  // Reactivation state
  const [reactivatingHandle, setReactivatingHandle] = useState(null);
  const [reactivationMsg, setReactivationMsg] = useState({});

  // Fetch individual standings
  const fetchStandings = useCallback(async () => {
    try {
      setIndividualLoading(true);
      setError("");
      const data = await getStandings();
      if (Array.isArray(data)) {
        const withRank = data.map((r, i) => ({
          ...r,
          defaultRank: r.rank || i + 1,
        }));
        setStandings(withRank);
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load individual standings.");
    } finally {
      setIndividualLoading(false);
    }
  }, []);

  // Fetch team standings
  const fetchTeam = useCallback(async () => {
    try {
      setTeamLoading(true);
      const data = await getVjudgeStandings();
      const list = Array.isArray(data) ? data : (data?.standings || []);
      const withRank = list.map((t, i) => ({
        ...t,
        teamName: t.teamName || t.name,
        defaultRank: t.rank || i + 1,
      }));
      setTeamStandings(withRank);
      if (data?.contests && Array.isArray(data.contests)) {
        setTeamContests(data.contests);
      }
    } catch (err) {
      console.warn("Failed to load team standings:", err);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  // Fetch inactive standings
  const fetchInactive = useCallback(async () => {
    try {
      setInactiveLoading(true);
      const data = await getInactiveStandings();
      if (Array.isArray(data)) {
        setInactiveList(data);
      }
    } catch (err) {
      console.warn("Failed to load inactive standings:", err);
    } finally {
      setInactiveLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStandings();
    fetchTeam();
    fetchInactive();
  }, [fetchStandings, fetchTeam, fetchInactive]);

  // Handle single sync
  const handleSyncHandle = async (handle) => {
    try {
      setSyncingHandle(handle);
      await syncHandle(handle);
      await fetchStandings();
    } catch (err) {
      alert("Failed to sync handle: " + (err?.response?.data?.message || err.message));
    } finally {
      setSyncingHandle(null);
    }
  };

  // Reactivate handle
  const handleReactivate = async (handle) => {
    try {
      setReactivatingHandle(handle);
      await submitReactivationRequest(handle);
      setReactivationMsg((prev) => ({
        ...prev,
        [handle]: { ok: true, text: "Reactivation requested! Pending admin approval." },
      }));
    } catch (err) {
      setReactivationMsg((prev) => ({
        ...prev,
        [handle]: { ok: false, text: err?.response?.data?.message || "Failed to request reactivation." },
      }));
    } finally {
      setReactivatingHandle(null);
    }
  };

  // Submit request form
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setRError("");
    setRSuccess("");
    const BATCH_REGEX = /^2K\d{2}$/i;

    const effectiveBatch = (
      rBatchSelect === "other"
        ? (rCustomBatchDigits ? `2K${rCustomBatchDigits}` : "")
        : rBatchSelect || rBatch
    ).trim().toUpperCase();

    if (requestTab === "handle") {
      if (!rHandle.trim() || !rName.trim() || !rRoll.trim() || !effectiveBatch || !rPasskey.trim()) {
        return setRError("All fields are required.");
      }
      if (!BATCH_REGEX.test(effectiveBatch)) {
        return setRError("Batch must be in the format 2K** (e.g. 2K22).");
      }
    } else {
      if (!rTeamName.trim() || !rTeamVjudgeHandle.trim() || !rTeamPasskey.trim()) {
        return setRError("Team name, VJudge handle, and passkey are required.");
      }
      for (let i = 0; i < 3; i++) {
        const m = rMembers[i];
        const mBatch = (
          m.batchSelect === "other"
            ? (m.customDigits ? `2K${m.customDigits}` : "")
            : m.batchSelect || m.batch
        ).trim().toUpperCase();
        if (!m.name.trim() || !m.roll.trim() || !mBatch) {
          return setRError(`All fields (Name, Roll, Batch) for Member ${i + 1} are required.`);
        }
        if (!BATCH_REGEX.test(mBatch)) {
          return setRError(`Batch for Member ${i + 1} must be in the format 2K** (e.g. 2K22).`);
        }
      }
    }

    try {
      setRLoading(true);
      if (requestTab === "handle") {
        await submitHandleRequest({
          handle: rHandle.trim(),
          name: rName.trim(),
          roll: rRoll.trim(),
          batch: effectiveBatch,
          passkey: rPasskey.trim(),
        });
      } else {
        await submitTeamRequest({
          teamName: rTeamName.trim(),
          teamVjudgeHandle: rTeamVjudgeHandle.trim(),
          members: rMembers.map((m) => ({
            name: m.name.trim(),
            roll: m.roll.trim(),
            batch: (
              m.batchSelect === "other"
                ? (m.customDigits ? `2K${m.customDigits}` : "")
                : m.batchSelect || m.batch
            ).trim().toUpperCase(),
          })),
          passkey: rTeamPasskey.trim(),
        });
      }
      setRSuccess("Request submitted successfully! Waiting for admin approval.");
      setTimeout(() => {
        setRequestModal(false);
        setRSuccess("");
      }, 2500);
    } catch (err) {
      setRError(err?.response?.data?.message || "Failed to submit request.");
    } finally {
      setRLoading(false);
    }
  };

  // Batches options
  const batchOptions = useMemo(
    () => computeBatchOptions(standings, teamStandings, inactiveList),
    [standings, teamStandings, inactiveList]
  );

  // Current view batches (strictly batches that have participants in the active/current view)
  const currentBatches = useMemo(() => {
    if (showInactive) {
      return getBatchesFromList(inactiveList, (r) => [r.batch]);
    }
    if (activeTab === "team") {
      return getBatchesFromList(teamStandings, (t) => (t.members || []).map((m) => m.batch));
    }
    return getBatchesFromList(standings, (r) => [r.batch]);
  }, [showInactive, activeTab, standings, teamStandings, inactiveList]);

  const primaryBatches = useMemo(() => currentBatches.slice(0, 5), [currentBatches]);
  const otherBatches = useMemo(() => {
    const fromData = currentBatches.slice(5);
    const fallbackBatches = ["2K21", "2K20", "2K19", "2K18", "2K17", "2K16"];
    const combined = [...fromData];
    fallbackBatches.forEach((fb) => {
      if (!primaryBatches.includes(fb) && !combined.includes(fb)) {
        combined.push(fb);
      }
    });
    return combined;
  }, [currentBatches, primaryBatches]);

  const selectedOthersCount = useMemo(
    () => selectedBatches.filter((b) => !primaryBatches.includes(b)).length,
    [selectedBatches, primaryBatches]
  );

  // Recent 5 batches for join modal (e.g. 2K26, 2K25, 2K24, 2K23, 2K22)
  const joinBatchOptions = useMemo(
    () => computeJoinBatchOptions(standings, teamStandings),
    [standings, teamStandings]
  );

  const toggleBatch = (b) => {
    setSelectedBatches((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  };

  // 3-state sorting: Ascending -> Descending -> Reset to default
  const handleSort = (col) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortCol(null);
      setSortDir(null);
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  // Filtered individual standings
  const filteredIndividual = useMemo(() => {
    let list = [...standings];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.handle?.toLowerCase().includes(q)
      );
    }
    if (selectedBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && selectedBatches.includes(b);
      });
    }

    // If reset / no active column sort, return default official rank order
    if (!sortCol) {
      list.sort((a, b) => (a.defaultRank || 0) - (b.defaultRank || 0));
      return list;
    }

    // Sort by chosen column
    list.sort((a, b) => {
      let valA, valB;
      if (sortCol === "rank") {
        valA = a.defaultRank || 9999;
        valB = b.defaultRank || 9999;
      } else if (sortCol === "rating") {
        valA = a.standingRating ?? a.rating ?? 1000;
        valB = b.standingRating ?? b.rating ?? 1000;
      } else if (sortCol === "solves") {
        valA = a.solvedCount || 0;
        valB = b.solvedCount || 0;
      } else if (sortCol === "maxRating") {
        valA = a.maxRating || 0;
        valB = b.maxRating || 0;
      } else if (sortCol === "name") {
        valA = (a.name || a.handle || "").toLowerCase();
        valB = (b.name || b.handle || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === "asc" ? valA - valB : valB - valA;
    });

    return list;
  }, [standings, search, selectedBatches, sortCol, sortDir]);

  // Filtered team standings
  const filteredTeams = useMemo(() => {
    let list = [...teamStandings];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.teamName?.toLowerCase().includes(q) ||
          (t.members || []).some(
            (m) =>
              m.name?.toLowerCase().includes(q) ||
              m.roll?.toLowerCase().includes(q) ||
              m.handle?.toLowerCase().includes(q)
          )
      );
    }
    if (selectedBatches.length > 0) {
      list = list.filter((t) =>
        (t.members || []).some((m) => {
          const b = normalizeBatch(m.batch);
          return b && selectedBatches.includes(b);
        })
      );
    }
    return list;
  }, [teamStandings, search, selectedBatches]);

  // Filtered inactive standings
  const filteredInactive = useMemo(() => {
    let list = [...inactiveList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.handle?.toLowerCase().includes(q) ||
          r.roll?.toLowerCase().includes(q)
      );
    }
    if (selectedBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && selectedBatches.includes(b);
      });
    }
    if (sortCol) {
      list.sort((a, b) => {
        let valA, valB;
        if (sortCol === "maxRating") {
          valA = a.maxRating || 0;
          valB = b.maxRating || 0;
        } else if (sortCol === "solves") {
          valA = a.solvedCount || a.totalSolved || 0;
          valB = b.solvedCount || b.totalSolved || 0;
        } else if (sortCol === "name") {
          valA = (a.name || a.handle || "").toLowerCase();
          valB = (b.name || b.handle || "").toLowerCase();
          return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortDir === "asc" ? valA - valB : valB - valA;
      });
    }
    return list;
  }, [inactiveList, search, selectedBatches, sortCol, sortDir]);

  const maxSolvesOverall = useMemo(
    () => Math.max(...standings.map((r) => r.solvedCount || 0), 1),
    [standings]
  );

  return (
    <div className="standings-page-redesign">
      {/* ── TOP HERO HEADER ── */}
      <div className="std-hero">
        <div className="std-hero-inner">
          <div className="std-hero-brand">
            <div className="std-logo-badge">
              <img src="/logo.png" alt="SGIPC" className="std-logo-img" />
            </div>
            <div>
              <div className="std-badge-pill">
                <span className="std-pulse-dot"></span>
                <span>KUET Competitive Programming</span>
              </div>
              <h1 className="std-title">
                Practice <span className="std-accent">Standings</span>
              </h1>
              <p className="std-subtitle">
                Official leaderboard tracking Codeforces problem solves &amp; VJudge team ratings
              </p>
            </div>
          </div>

          <div className="std-hero-actions">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                className="std-theme-toggle"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
                aria-label="Toggle theme"
              >
                <span>{theme === "dark" ? "☀️ Light" : "🌙 Dark"}</span>
              </button>
              <button className="std-btn-join" onClick={() => setRequestModal(true)}>
                <span>＋ Request to Join</span>
              </button>
            </div>
            {lastUpdated && (
              <span className="std-sync-time">
                Synced at {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT CARD ── */}
      <div className="std-container">
        {/* Tab Selector */}
        <div className="std-tabs-bar">
          <div className="std-tabs-group">
            <button
              className={`std-tab-btn ${activeTab === "individual" && !showInactive ? "active" : ""}`}
              onClick={() => {
                setActiveTab("individual");
                setShowInactive(false);
                setSelectedBatches([]);
                setOthersOpen(false);
              }}
            >
              <span>🏆 Individual Rankings</span>
              <span className="std-tab-count">{individualLoading ? "…" : standings.length}</span>
            </button>

            <button
              className={`std-tab-btn ${activeTab === "team" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("team");
                setShowInactive(false);
                setSelectedBatches([]);
                setOthersOpen(false);
              }}
            >
              <span>👥 Team Leaderboard</span>
              <span className="std-tab-count">{teamLoading ? "…" : teamStandings.length}</span>
            </button>
          </div>

          <button
            className={`std-btn-inactive ${showInactive ? "active" : ""}`}
            onClick={() => {
              const nextState = !showInactive;
              setShowInactive(nextState);
              if (nextState) fetchInactive();
              setSelectedBatches([]);
              setOthersOpen(false);
            }}
            title="View inactive handles"
          >
            <span>💤 Inactive Accounts</span>
            {inactiveList.length > 0 && <span className="std-badge-inactive">{inactiveList.length}</span>}
          </button>
        </div>

        {/* ── CONTROLS & BATCH FILTER BAR (Active on all views) ── */}
        <div className="std-controls-card">
          <div className="std-search-wrapper">
            <span className="std-search-icon">🔍</span>
            <input
              type="text"
              placeholder={
                showInactive
                  ? "Search inactive accounts by name, roll, or handle..."
                  : activeTab === "team"
                  ? "Search teams by name, member, or roll..."
                  : "Search by name, roll, or handle..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="std-search-input"
            />
            {search && (
              <button className="std-clear-btn" onClick={() => setSearch("")}>
                ✕
              </button>
            )}
          </div>

          {/* Batch Filter Pills + Others Dropdown */}
          <div className="std-batches-list">
            <span className="std-filter-label">Batch:</span>
            <button
              className={`std-batch-pill ${selectedBatches.length === 0 ? "active" : ""}`}
              onClick={() => setSelectedBatches([])}
            >
              All
            </button>
            {primaryBatches.map((b) => (
              <button
                key={b}
                className={`std-batch-pill ${selectedBatches.includes(b) ? "active" : ""}`}
                onClick={() => toggleBatch(b)}
              >
                {b}
              </button>
            ))}
            <div className="std-others-wrapper" ref={othersRef}>
              <button
                type="button"
                className={`std-others-btn ${selectedOthersCount > 0 ? "active" : ""}`}
                onClick={() => setOthersOpen((prev) => !prev)}
                aria-expanded={othersOpen}
              >
                <span>Others</span>
                {selectedOthersCount > 0 && (
                  <span className="std-others-badge">{selectedOthersCount}</span>
                )}
                <span style={{ fontSize: 9 }}>▾</span>
              </button>
              {othersOpen && (
                <div className="std-others-dropdown">
                  <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    {otherBatches.map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={`std-others-item ${selectedBatches.includes(b) ? "active" : ""}`}
                        onClick={() => toggleBatch(b)}
                      >
                        <span>{b}</span>
                        {selectedBatches.includes(b) && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                  <div className="std-others-custom">
                    <div className="std-others-custom-title">Custom Batch</div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (othersCustomDigits.trim().length === 2) {
                          const customBatch = `2K${othersCustomDigits.trim()}`;
                          if (!selectedBatches.includes(customBatch)) {
                            setSelectedBatches((prev) => [...prev, customBatch]);
                          }
                          setOthersCustomDigits("");
                        }
                      }}
                      className="std-others-custom-row"
                    >
                      <div className="std-batch-input-group" style={{ maxWidth: 88 }}>
                        <span className="std-batch-prefix" style={{ padding: "4px 6px", fontSize: 11 }}>2K</span>
                        <input
                          type="text"
                          className="std-batch-digits-input"
                          placeholder="20"
                          maxLength={2}
                          value={othersCustomDigits}
                          onChange={(e) => setOthersCustomDigits(e.target.value.replace(/\D/g, ""))}
                          style={{ padding: "4px 6px", fontSize: 11 }}
                        />
                      </div>
                      <button type="submit" className="std-others-add-btn" disabled={othersCustomDigits.length !== 2}>
                        + Add
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && <div className="notice error">{error}</div>}

        {/* ══════════════════════════════════════════════════════════════════
            VIEW 1: INDIVIDUAL RANKINGS
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "individual" && !showInactive && (
          <div className="std-table-card">
            {individualLoading ? (
              <div className="std-loading-state">
                <div className="std-spinner"></div>
                <p>Loading individual standings…</p>
              </div>
            ) : filteredIndividual.length === 0 ? (
              <div className="std-empty-state">
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                <h3>No participants found</h3>
                <p>Try adjusting your search query or batch filters.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="std-table">
                  <thead>
                    <tr>
                      <th style={{ width: 75, textAlign: "center" }} onClick={() => handleSort("rank")}>
                        Rank <SortIcon col="rank" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th onClick={() => handleSort("name")}>
                        Participant <SortIcon col="name" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 220 }} onClick={() => handleSort("solves")}>
                        Solved Progress <SortIcon col="solves" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 160, textAlign: "center" }} onClick={() => handleSort("rating")}>
                        Practice Rating <SortIcon col="rating" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 110, textAlign: "center" }} onClick={() => handleSort("maxRating")}>
                        CF Max <SortIcon col="maxRating" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 65, textAlign: "center" }}>Info</th>
                      <th style={{ width: 65, textAlign: "center" }}>Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndividual.map((row, idx) => {
                      const displayRank = row.defaultRank || row.rank || idx + 1;
                      const ratingVal = row.standingRating ?? row.rating ?? 1000;
                      const tier = getRatingLevel(ratingVal);
                      const solvePct = Math.min(100, Math.round(((row.solvedCount || 0) / maxSolvesOverall) * 100));

                      return (
                        <tr key={row.handle || idx} className={`std-row ${displayRank <= 3 ? `top-${displayRank}` : ""}`}>
                          {/* Rank */}
                          <td style={{ textAlign: "center" }}>
                            <div className={`std-rank-badge rank-${displayRank}`}>
                              {displayRank === 1 ? "👑 1" : displayRank === 2 ? "🥈 2" : displayRank === 3 ? "🥉 3" : `#${displayRank}`}
                            </div>
                          </td>

                          {/* Participant with Batch below Name */}
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <div className="std-participant-name">{row.name || row.handle}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <a
                                  href={`https://codeforces.com/profile/${row.handle}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="std-cf-link"
                                >
                                  <span>{row.handle}</span>
                                  <span style={{ fontSize: 10 }}>↗</span>
                                </a>
                                {row.batch && (
                                  <span className="std-batch-badge">
                                    {normalizeBatch(row.batch) || row.batch}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Solves Progress Bar */}
                          <td>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                              <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                                {row.solvedCount?.toLocaleString() || 0}
                              </span>
                              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>solves</span>
                            </div>
                            <div className="std-progress-bg">
                              <div
                                className="std-progress-bar"
                                style={{
                                  width: `${solvePct}%`,
                                  background: displayRank === 1 ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, #38bdf8, #6366f1)",
                                }}
                              />
                            </div>
                          </td>

                          {/* Practice Rating */}
                          <td style={{ textAlign: "center" }}>
                            <div className="std-rating-num" style={{ color: tier.color }}>
                              {ratingVal}
                            </div>
                            <span className={`std-tier-pill tier-${tier.cls}`}>
                              {tier.level}
                            </span>
                          </td>

                          {/* CF Max */}
                          <td style={{ textAlign: "center" }}>
                            <span className="std-cf-max">
                              {row.maxRating || "—"}
                            </span>
                          </td>

                          {/* Info Eye Button */}
                          <td style={{ textAlign: "center" }}>
                            <button
                              className="std-btn-icon"
                              onClick={() => setHistoryTarget(row)}
                              title="View performance & daily activity info"
                              aria-label="View Info"
                            >
                              👁️
                            </button>
                          </td>

                          {/* Sync / Refresh */}
                          <td style={{ textAlign: "center" }}>
                            <button
                              className="std-btn-icon"
                              onClick={() => handleSyncHandle(row.handle)}
                              disabled={syncingHandle === row.handle}
                              title="Force refresh Codeforces stats"
                              aria-label="Sync Handle"
                            >
                              <span className={syncingHandle === row.handle ? "spinning" : ""}>🔄</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            VIEW 2: TEAM LEADERBOARD
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "team" && !showInactive && (
          <div className="std-table-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  Team Standings ({filteredTeams.length})
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                  Official 3-person team leaderboard tracking VJudge contests &amp; Elo ratings
                </p>
              </div>
              <button
                type="button"
                className="secondary sm"
                onClick={() => setContestsModalOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
              >
                <span>📋 Counted Contests ({teamContests.filter((c) => c.enabled !== false).length})</span>
              </button>
            </div>

            {teamLoading ? (
              <div className="std-loading-state">
                <div className="std-spinner"></div>
                <p>Loading team standings…</p>
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="std-empty-state">
                <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
                <h3>No teams found</h3>
                <p>Try refining your search or request to register a team.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="std-table">
                  <thead>
                    <tr>
                      <th style={{ width: 70, textAlign: "center" }}>Rank</th>
                      <th>Team Name &amp; VJudge Profile</th>
                      <th style={{ width: 140, textAlign: "center" }}>Team Elo Rating</th>
                      <th style={{ width: 100, textAlign: "center" }}>Contests</th>
                      <th style={{ width: 65, textAlign: "center" }}>Info</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeams.map((team, idx) => {
                      const displayRank = team.rank || team.defaultRank || idx + 1;
                      const vjudgeHandle = team.teamVjudgeHandle || team.aliases?.[0] || team.teamName || team.name;
                      const contestsCount = team.contests ?? team.contestsHistory?.length ?? 0;
                      return (
                        <tr key={team.id || team._id || idx} className={`std-row ${displayRank <= 3 ? `top-${displayRank}` : ""}`}>
                          <td style={{ textAlign: "center" }}>
                            <div className={`std-rank-badge rank-${displayRank}`}>
                              {displayRank === 1 ? "👑 1" : displayRank === 2 ? "🥈 2" : displayRank === 3 ? "🥉 3" : `#${displayRank}`}
                            </div>
                          </td>

                          <td>
                            <div className="std-participant-name">{team.teamName || team.name}</div>
                            {vjudgeHandle && (
                              <a
                                href={`https://vjudge.net/user/${encodeURIComponent(vjudgeHandle)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="std-cf-link"
                              >
                                <span>VJ: {vjudgeHandle}</span>
                                <span style={{ fontSize: 10 }}>↗</span>
                              </a>
                            )}
                          </td>

                          <td style={{ textAlign: "center" }}>
                            <div className="std-rating-num" style={{ color: "var(--accent)" }}>
                              {Math.round(team.rating || 1500)}
                            </div>
                          </td>

                          <td style={{ textAlign: "center" }}>
                            <span className="std-roll-pill">{contestsCount}</span>
                          </td>

                          <td style={{ textAlign: "center" }}>
                            <button
                              className="std-btn-icon"
                              onClick={() => setTeamHistoryTarget(team)}
                              title="View Team Info & Contests"
                              aria-label="View Team Info"
                            >
                              👁️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            VIEW 3: INACTIVE ACCOUNTS
            ══════════════════════════════════════════════════════════════════ */}
        {showInactive && (
          <div className="std-table-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800 }}>Inactive Accounts Archive</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Handles inactive for over 90 days. Click Reactivate to submit a restore request.
                </p>
              </div>
              <button className="primary sm" onClick={() => setShowInactive(false)}>
                ← Back to Active Standings
              </button>
            </div>

            {inactiveLoading ? (
              <div className="std-loading-state">
                <div className="std-spinner"></div>
                <p>Loading inactive archive…</p>
              </div>
            ) : filteredInactive.length === 0 ? (
              <div className="std-empty-state">
                <div style={{ fontSize: 36, marginBottom: 8 }}>💤</div>
                <h3>No inactive accounts found</h3>
                <p>Try adjusting your search query or batch filters.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="std-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort("name")}>
                        Participant <SortIcon col="name" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 120, textAlign: "center" }} onClick={() => handleSort("maxRating")}>
                        CF Max <SortIcon col="maxRating" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 130, textAlign: "center" }} onClick={() => handleSort("solves")}>
                        Past Solves <SortIcon col="solves" activeCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ width: 65, textAlign: "center" }}>Info</th>
                      <th style={{ width: 180, textAlign: "right" }}>Reactivate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInactive.map((row) => (
                      <tr key={row.handle} className="std-row">
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div className="std-participant-name">{row.name || row.handle}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <a
                                href={`https://codeforces.com/profile/${row.handle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="std-cf-link"
                              >
                                <span>{row.handle}</span>
                                <span style={{ fontSize: 10 }}>↗</span>
                              </a>
                              {row.batch && (
                                <span className="std-batch-badge">
                                  {normalizeBatch(row.batch) || row.batch}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="std-rating-badge">{row.maxRating || "—"}</span>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>
                          {(row.solvedCount || row.totalSolved || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="std-info-btn"
                            onClick={() => setHistoryTarget(row)}
                            title={`View details & activity for ${row.name || row.handle}`}
                            aria-label={`View info for ${row.name || row.handle}`}
                          >
                            👁️
                          </button>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {reactivationMsg[row.handle] ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: reactivationMsg[row.handle].ok ? "#10b981" : "#ef4444",
                              }}
                            >
                              {reactivationMsg[row.handle].text}
                            </span>
                          ) : (
                            <button
                              className="secondary sm"
                              onClick={() => handleReactivate(row.handle)}
                              disabled={reactivatingHandle === row.handle}
                            >
                              {reactivatingHandle === row.handle ? "Submitting…" : "Request Reactivation"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: REQUEST TO JOIN (INDIVIDUAL OR TEAM)
          ══════════════════════════════════════════════════════════════════ */}
      {requestModal && (
        <div className="std-modal-overlay" onClick={() => setRequestModal(false)}>
          <div className="std-modal-card join-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="std-modal-header">
              <div>
                <h2>Request to Join Standings</h2>
                <p>Register your handle or team to get listed on the leaderboard</p>
              </div>
              <button className="std-modal-close" onClick={() => setRequestModal(false)}>
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="std-modal-tabs">
              <button
                className={`std-modal-tab ${requestTab === "handle" ? "active" : ""}`}
                onClick={() => setRequestTab("handle")}
              >
                👤 Individual Handle
              </button>
              <button
                className={`std-modal-tab ${requestTab === "team" ? "active" : ""}`}
                onClick={() => setRequestTab("team")}
              >
                👥 VJudge Team
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="std-modal-body">
              {rError && <div className="notice error">{rError}</div>}
              {rSuccess && <div className="notice success">{rSuccess}</div>}

              {requestTab === "handle" ? (
                <>
                  <div className="std-field">
                    <label>Codeforces Handle *</label>
                    <input
                      type="text"
                      placeholder="e.g. tourist"
                      value={rHandle}
                      onChange={(e) => setRHandle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="std-field">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={rName}
                      onChange={(e) => setRName(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="std-field">
                      <label>Roll Number *</label>
                      <input
                        type="text"
                        placeholder="e.g. 2107070"
                        value={rRoll}
                        onChange={(e) => setRRoll(e.target.value)}
                        autoComplete="off"
                        required
                      />
                    </div>
                    <div className="std-field">
                      <label>Batch *</label>
                      <select
                        value={rBatchSelect}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRBatchSelect(val);
                          if (val !== "other") {
                            setRBatch(val);
                          } else {
                            setRBatch(rCustomBatchDigits ? `2K${rCustomBatchDigits}` : "");
                          }
                        }}
                        required
                      >
                        <option value="">Select Batch</option>
                        {joinBatchOptions.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                        <option value="other">Other...</option>
                      </select>
                    </div>
                  </div>
                  {rBatchSelect === "other" && (
                    <div className="std-field" style={{ marginTop: 4 }}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Enter Batch (2K fixed + 2 digits) *
                      </label>
                      <div className="std-batch-input-group">
                        <span className="std-batch-prefix">2K</span>
                        <input
                          type="text"
                          className="std-batch-digits-input"
                          placeholder="20"
                          maxLength={2}
                          value={rCustomBatchDigits}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            setRCustomBatchDigits(digits);
                            setRBatch(digits ? `2K${digits}` : "");
                          }}
                          required
                          autoFocus
                        />
                      </div>
                    </div>
                  )}
                  <div className="std-field">
                    <label>Passkey *</label>
                    <input
                      type="password"
                      placeholder="Enter submission passkey"
                      value={rPasskey}
                      onChange={(e) => setRPasskey(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="std-field">
                    <label>Team Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. KUET_Effervescent"
                      value={rTeamName}
                      onChange={(e) => setRTeamName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="std-field">
                    <label>Team VJudge Handle *</label>
                    <input
                      type="text"
                      placeholder="e.g. KUET_Effervescent"
                      value={rTeamVjudgeHandle}
                      onChange={(e) => setRTeamVjudgeHandle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: "block" }}>
                      Team Members (3 Members Required)
                    </label>
                    {[0, 1, 2].map((idx) => (
                      <div key={idx} className="std-team-member-card">
                        <div className="std-member-card-title">
                          <span>👤</span>
                          <span>Member #{idx + 1}</span>
                        </div>
                        <div className="std-member-grid">
                          <input
                            type="text"
                            placeholder="Full Name"
                            value={rMembers[idx].name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, name: val } : m)));
                            }}
                            required
                          />
                          <input
                            type="text"
                            placeholder="e.g. 2107070"
                            value={rMembers[idx].roll}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, roll: val } : m)));
                            }}
                            autoComplete="off"
                            required
                          />
                          <select
                            value={
                              rMembers[idx].batchSelect ||
                              (joinBatchOptions.includes(rMembers[idx].batch)
                                ? rMembers[idx].batch
                                : rMembers[idx].batch
                                ? "other"
                                : "")
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setRMembers((prev) =>
                                prev.map((m, i) =>
                                  i === idx
                                    ? {
                                        ...m,
                                        batchSelect: val,
                                        batch:
                                          val === "other"
                                            ? m.customDigits
                                              ? `2K${m.customDigits}`
                                              : ""
                                            : val,
                                      }
                                    : m
                                )
                              );
                            }}
                            required
                          >
                            <option value="">Batch</option>
                            {joinBatchOptions.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                            <option value="other">Other...</option>
                          </select>
                        </div>
                        {(rMembers[idx].batchSelect === "other" ||
                          (!joinBatchOptions.includes(rMembers[idx].batch) &&
                            rMembers[idx].batch)) && (
                          <div style={{ marginTop: 8 }}>
                            <div className="std-batch-input-group">
                              <span
                                className="std-batch-prefix"
                                style={{ padding: "6px 10px", fontSize: 12 }}
                              >
                                2K
                              </span>
                              <input
                                type="text"
                                className="std-batch-digits-input"
                                placeholder="20"
                                maxLength={2}
                                value={
                                  rMembers[idx].customDigits ||
                                  (rMembers[idx].batch?.startsWith("2K")
                                    ? rMembers[idx].batch.slice(2)
                                    : "")
                                }
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, "");
                                  setRMembers((prev) =>
                                    prev.map((m, i) =>
                                      i === idx
                                        ? {
                                            ...m,
                                            customDigits: digits,
                                            batch: digits ? `2K${digits}` : "",
                                          }
                                        : m
                                    )
                                  );
                                }}
                                style={{ padding: "6px 10px", fontSize: 12 }}
                                required
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="std-field" style={{ marginTop: 8 }}>
                    <label>Passkey *</label>
                    <input
                      type="password"
                      placeholder="Enter submission passkey"
                      value={rTeamPasskey}
                      onChange={(e) => setRTeamPasskey(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div className="std-modal-footer">
                <button type="button" className="secondary sm" onClick={() => setRequestModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary sm" disabled={rLoading}>
                  {rLoading ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Practice Rating & Daily Activity History Modal */}
      {historyTarget && (
        <ActivityHistoryModal
          participant={historyTarget}
          onClose={() => setHistoryTarget(null)}
          onSync={handleSyncHandle}
          isSyncing={syncingHandle === historyTarget?.handle}
        />
      )}

      {/* Team Details & Contests Modal */}
      {teamHistoryTarget && (
        <div className="std-modal-overlay" onClick={() => setTeamHistoryTarget(null)}>
          <div className="std-modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="std-modal-header">
              <div>
                <h2>{teamHistoryTarget.teamName || teamHistoryTarget.name}</h2>
                <p>
                  VJudge Profile:{" "}
                  <a
                    href={`https://vjudge.net/user/${encodeURIComponent(
                      teamHistoryTarget.teamVjudgeHandle ||
                        teamHistoryTarget.aliases?.[0] ||
                        teamHistoryTarget.teamName ||
                        teamHistoryTarget.name
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--primary-light)", textDecoration: "none" }}
                  >
                    {teamHistoryTarget.teamVjudgeHandle ||
                      teamHistoryTarget.aliases?.[0] ||
                      teamHistoryTarget.teamName ||
                      teamHistoryTarget.name}{" "}
                    ↗
                  </a>
                </p>
              </div>
              <button className="std-modal-close" onClick={() => setTeamHistoryTarget(null)}>
                ✕
              </button>
            </div>

            <div
              className="std-modal-body"
              style={{
                maxHeight: "65vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* Stats Overview */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div
                  style={{
                    background: "var(--bg-surface)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    Team Rating
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: "var(--primary-light)",
                      marginTop: 4,
                    }}
                  >
                    {Math.round(teamHistoryTarget.rating || 1500)}
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--bg-surface)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    Contests
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: "var(--text-primary)",
                      marginTop: 4,
                    }}
                  >
                    {teamHistoryTarget.contests ?? teamHistoryTarget.contestsHistory?.length ?? 0}
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--bg-surface)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    Rank
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#fbbf24",
                      marginTop: 4,
                    }}
                  >
                    #{teamHistoryTarget.rank || teamHistoryTarget.defaultRank || "—"}
                  </div>
                </div>
              </div>

              {/* Members */}
              <div>
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "var(--text-secondary)",
                  }}
                >
                  Team Members
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(teamHistoryTarget.members || []).map((m, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{m.name || `Member #${i + 1}`}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {m.roll && <span className="std-chip-roll">{m.roll}</span>}
                        {m.batch && <span className="std-chip-batch">{m.batch}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contests History */}
              <div>
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "var(--text-secondary)",
                  }}
                >
                  Rated Contests History ({teamHistoryTarget.contestsHistory?.length || 0})
                </h4>
                {!teamHistoryTarget.contestsHistory ||
                teamHistoryTarget.contestsHistory.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
                    No recorded contest participations yet.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {teamHistoryTarget.contestsHistory.map((ch, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <a
                            href={`https://vjudge.net/contest/${ch.contestId}#rank`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: "var(--text-primary)",
                              textDecoration: "none",
                            }}
                          >
                            {ch.contestTitle || `Contest #${ch.contestId}`} ↗
                          </a>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            {ch.rankDisplay ? `Rank: ${ch.rankDisplay}` : `Rank #${ch.rank || "—"}`} •
                            Solved: {ch.solved ?? 0}
                          </div>
                        </div>
                        {ch.penalty !== undefined && (
                          <div
                            style={{
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              fontSize: 12,
                              color: "var(--text-muted)",
                            }}
                          >
                            Penalty: {ch.penalty}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="std-modal-footer">
              <button className="secondary sm" onClick={() => setTeamHistoryTarget(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Considered / Counted Contests Modal */}
      {contestsModalOpen && (
        <div className="std-modal-overlay" onClick={() => setContestsModalOpen(false)}>
          <div className="std-modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="std-modal-header">
              <div>
                <h2>Counted Team Contests</h2>
                <p>Contests included in official team Elo calculation</p>
              </div>
              <button className="std-modal-close" onClick={() => setContestsModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="std-modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: "16px 20px" }}>
              {teamContests.filter((c) => c.enabled !== false).length === 0 ? (
                <div className="std-empty-state">
                  <p>No active contests counted yet.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {teamContests
                    .filter((c) => c.enabled !== false)
                    .map((c, idx) => (
                      <a
                        key={c._id || c.contestId}
                        href={`https://vjudge.net/contest/${c.contestId}#rank`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 14px",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          textDecoration: "none",
                          gap: 12,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 12,
                              fontWeight: 800,
                              color: "var(--text-muted)",
                              width: 22,
                              textAlign: "right",
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}.
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color: "var(--text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {c.title || `Contest #${c.contestId}`}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                              ID: #{c.contestId} • Participants: {c.ranklist?.length || Object.keys(c.participants || {}).length || "—"}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--primary-light)",
                            background: "rgba(99, 102, 241, 0.12)",
                            padding: "4px 8px",
                            borderRadius: 6,
                            flexShrink: 0,
                          }}
                        >
                          View Standings ↗
                        </span>
                      </a>
                    ))}
                </div>
              )}
            </div>

            <div className="std-modal-footer">
              <button className="secondary sm" onClick={() => setContestsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
