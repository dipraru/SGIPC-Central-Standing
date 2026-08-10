import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  getStandings,
  getVjudgeStandings,
  getInactiveStandings,
  submitHandleRequest,
  submitTeamRequest,
  submitReactivationRequest,
} from "../api.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getRatingLevel = (r) => {
  if (r < 1200) return { level: "Dead",        cls: "dead"       };
  if (r < 1400) return { level: "WarmUp",      cls: "warmup"     };
  if (r < 1800) return { level: "Trying",      cls: "trying"     };
  if (r < 2000) return { level: "TryingHard",  cls: "tryinghard" };
  if (r < 2400) return { level: "Pushing",     cls: "pushing"    };
  if (r < 3000) return { level: "Hardcore",    cls: "hardcore"   };
  return            { level: "⚡ Aliens",    cls: "aliens"     };
};
const rankCls = (n) => n === 1 ? "gold" : n === 2 ? "silver" : n === 3 ? "bronze" : "default";

const extractBatchDigits = (b) => { const m = (b || "").match(/(\d{2})$/); return m ? m[1] : null; };
const normalizeBatch     = (b) => { const d = extractBatchDigits(b); return d ? `2K${d}` : null; };

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

// ─── EloMode labels ───────────────────────────────────────────────────────────
const ELO_LABELS = {
  "normal":              "Classic Elo",
  "gain-only":           "Gain-only",
  "zero-participation":  "Participation Required",
};

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
  const [teamLoading,      setTeamLoading]      = useState(true);
  const [teamError,        setTeamError]        = useState("");
  const [eloMode,          setEloMode]          = useState("normal");
  const [lastTeamFetchAt,  setLastTeamFetchAt]  = useState(null);

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
  const [rTeamName, setRTeamName] = useState("");
  const [rMembers,  setRMembers]  = useState([emptyMember(), emptyMember(), emptyMember()]);
  const [rTeamPasskey, setRTeamPasskey] = useState("");

  const [rError,    setRError]    = useState("");
  const [rSuccess,  setRSuccess]  = useState("");
  const [rLoading,  setRLoading]  = useState(false);

  // ── Computed ───────────────────────────────────────────────────────────────
  const availableBatches = useMemo(() => {
    const s = new Set();
    standings.forEach((r) => { const n = normalizeBatch(r.batch); if (n) s.add(n); });
    return Array.from(s).sort();
  }, [standings]);

  const globalRankMap = useMemo(() => {
    const m = new Map();
    standings.forEach((r, i) => m.set(String(r.id), i + 1));
    return m;
  }, [standings]);

  const batchFiltered = useMemo(() => {
    if (!selectedBatches.length) return standings;
    return standings.filter((r) => {
      const d = extractBatchDigits(r.batch);
      return d && selectedBatches.some((b) => extractBatchDigits(b) === d);
    });
  }, [standings, selectedBatches]);

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
      setTeamStandings(data.standings || []);
      setEloMode(data.eloMode || "normal");
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
        setTeamStandings(c.data?.standings || []);
        setEloMode(c.data?.eloMode || "normal");
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
    setRTeamName(""); setRMembers([emptyMember(), emptyMember(), emptyMember()]); setRTeamPasskey("");
    setRError(""); setRSuccess("");
  };
  const openRequestModal = () => { resetRequestForm(); setRequestTab("handle"); setRequestModal(true); };

  const updateMember = (idx, field, val) =>
    setRMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));

  const submitRequest = async () => {
    setRError(""); setRSuccess("");
    if (rLoading) return;
    if (requestTab === "handle") {
      if (!rHandle.trim() || !rName.trim() || !rRoll.trim() || !rBatch.trim() || !rPasskey.trim())
        return setRError("All fields are required.");
    } else {
      if (!rTeamName.trim() || !rTeamPasskey.trim()) return setRError("Team name and passkey are required.");
      for (let i = 0; i < 3; i++) {
        const m = rMembers[i];
        if (!m.handle.trim() || !m.name.trim() || !m.roll.trim() || !m.batch.trim())
          return setRError(`All fields for Member ${i + 1} are required.`);
      }
    }
    setRLoading(true);
    try {
      if (requestTab === "handle") {
        await submitHandleRequest({ handle: rHandle.trim(), name: rName.trim(), roll: rRoll.trim(), batch: rBatch.trim(), passkey: rPasskey.trim() });
      } else {
        await submitTeamRequest({ teamName: rTeamName.trim(), members: rMembers, passkey: rTeamPasskey.trim() });
      }
      setRSuccess("Request submitted successfully!");
      resetRequestForm();
      setTimeout(() => setRSuccess(""), 3000);
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
        <div className="hero-inner">
          <div>
            <span className="badge">SGIPC · Competitive Programming</span>
            <h1>Practice <span className="accent">Standings</span></h1>
            <p>Live Elo-based rankings from Codeforces practice &amp; VJudge contests</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button className="primary sm" onClick={openRequestModal}>＋ Request to Join</button>
            </div>
          </div>
          <img src="/logo.png" alt="SGIPC" className="hero-logo" />
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
              <p className="card-subtitle">Practice Elo rating based on Codeforces solved problems</p>
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
                  { cls: "dead",       label: "<1200 Dead"       },
                  { cls: "warmup",     label: "<1400 WarmUp"     },
                  { cls: "trying",     label: "<1800 Trying"     },
                  { cls: "tryinghard", label: "<2000 TryingHard" },
                  { cls: "pushing",    label: "<2400 Pushing"    },
                  { cls: "hardcore",   label: "<3000 Hardcore"   },
                  { cls: "aliens",     label: "≥3000 Aliens"     },
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
                    <th>Handle</th>
                    <th style={{ width: 100 }}>CF Max</th>
                    <th style={{ width: 80 }}>Solved</th>
                    <th style={{ width: 160 }}>Practice Rating</th>
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
          <div className="card-header">
            <div>
              <h2>Team Rankings</h2>
              <p className="card-subtitle">VJudge contest performance · {ELO_LABELS[eloMode]}</p>
            </div>
          </div>

          {teamLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading team standings...</p></div>}
          {!teamLoading && teamError && <div className="notice error">{teamError}</div>}
          {!teamLoading && !teamError && teamStandings.length === 0 && <div className="empty-state"><p>No team standings yet.</p></div>}
          {!teamLoading && !teamError && teamStandings.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Team</th>
                  <th style={{ width: 130 }}>Rating</th>
                  <th style={{ width: 90 }}>Contests</th>
                </tr>
              </thead>
              <tbody>
                {teamStandings.map((row) => (
                  <tr key={row.id}>
                    <td data-label="#"><div className={`rank-badge ${rankCls(row.rank)}`}>{row.rank}</div></td>
                    <td data-label="Team">
                      <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{row.name}</span>
                      {row.aliases && row.aliases.length > 0 && (
                        <div className="handle-sub">
                          {row.aliases.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td data-label="Rating">
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)", fontSize: 15 }}>
                        {row.ratingDisplay}
                      </span>
                    </td>
                    <td data-label="Contests" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {row.contests}
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
                    <input type="text" value={rBatch} onChange={(e) => setRBatch(e.target.value)} placeholder="e.g. 2K22" autoComplete="off" />
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
                    <input type="text" value={rTeamName} onChange={(e) => setRTeamName(e.target.value)} placeholder="Team name" autoComplete="off" />
                  </div>

                  {[0, 1, 2].map((i) => (
                    <div key={i} className="member-section">
                      <div className="member-section-label">Member {i + 1}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div className="field">
                          <label>CF Handle *</label>
                          <input type="text" value={rMembers[i].handle} onChange={(e) => updateMember(i, "handle", e.target.value)} placeholder="codeforces handle" autoComplete="off" />
                        </div>
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
                          <input type="text" value={rMembers[i].batch} onChange={(e) => updateMember(i, "batch", e.target.value)} placeholder="e.g. 2K22" autoComplete="off" />
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
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setRequestModal(false)}>Cancel</button>
              <button className="primary" onClick={submitRequest} disabled={rLoading}>
                {rLoading ? "Submitting…" : "Submit Request"}
              </button>
            </div>
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
                ["Handle",         <a href={`https://codeforces.com/profile/${infoModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{infoModal.handle}</a>],
                ["Name",           infoModal.name  || "Not provided"],
                ["Roll",           infoModal.roll  || "Not provided"],
                ["Batch",          normalizeBatch(infoModal.batch) || infoModal.batch || "Not provided"],
                ["CF Max Rating",  <span className="stat-badge rating">{infoModal.maxRating || "—"}</span>],
                ["Practice Rating",<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{infoModal.standingRating}</span>],
                ["Global Rank",    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>#{globalRankMap.get(String(infoModal.id)) ?? "?"}</span>],
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
                ["Handle",        <a href={`https://codeforces.com/profile/${inactiveModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{inactiveModal.handle}</a>],
                ["Name",          inactiveModal.name  || "Not provided"],
                ["Batch",         normalizeBatch(inactiveModal.batch) || inactiveModal.batch || "Not provided"],
                ["CF Max Rating", <span className="stat-badge rating">{inactiveModal.maxRating || "—"}</span>],
                ["Total Solved",  <span className="stat-badge solved">{inactiveModal.totalSolved}</span>],
                ["Inactive Since",inactiveModal.inactiveSince ? new Date(inactiveModal.inactiveSince).toLocaleDateString() : "Unknown"],
                ["Status",        <span className="inactive-badge">💤 Inactive</span>],
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
    </div>
  );
};

export default Standings;
