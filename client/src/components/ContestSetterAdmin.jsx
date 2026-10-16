import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getGymContests,
  getGymStats,
  toggleGymContestDone,
  fetchGymContestProblems,
  syncNewerGymContests,
} from "../api.js";

// Helper: Format date
const formatDate = (secs) => {
  if (!secs) return "Date unknown";
  const d = new Date(secs * 1000);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

// Helper: Format duration
const formatDuration = (secs) => {
  if (!secs) return "5h 00m";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

// Helper: Short number for chart Y-axis (e.g. 1.2k)
const formatShortNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(num));
};

// Helper: 3 nice levels for chart Y axis
const getNiceThreeLevels = (maxVal) => {
  if (!maxVal || maxVal <= 0) return [null, null, null];
  if (maxVal <= 5) return [1, 3, 5];
  if (maxVal <= 10) return [2, 5, 10];
  if (maxVal <= 20) return [5, 10, 20];
  if (maxVal <= 50) return [10, 25, 50];
  if (maxVal <= 100) return [25, 50, 100];

  const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const norm = maxVal / mag;
  let top;
  if (norm <= 1.5) top = 1.5 * mag;
  else if (norm <= 2.5) top = 2.5 * mag;
  else if (norm <= 5.0) top = 5.0 * mag;
  else if (norm <= 7.5) top = 7.5 * mag;
  else top = 10.0 * mag;

  return [Math.round(top * 0.33), Math.round(top * 0.66), Math.round(top)];
};

export const ContestSetterAdmin = () => {
  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Contests
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [doneStatus, setDoneStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [activeMetric, setActiveMetric] = useState("all_time"); // 'all_time' | 'contest'
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [jumpPage, setJumpPage] = useState("");

  // Custom Solve Preset Filter
  const [showConditions, setShowConditions] = useState(false);
  const [activePreset, setActivePreset] = useState(null);

  // Syncing
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(null);

  // Single contest problems fetching
  const [fetchingContestId, setFetchingContestId] = useState(null);

  // Copy toast
  const [copyToast, setCopyToast] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await getGymStats();
      if (res.status === "OK") setStats(res);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Load contests
  const loadContests = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = {
        page,
        limit: 50,
        search: debouncedSearch || undefined,
        category: category !== "all" ? category : undefined,
        status: doneStatus !== "all" ? doneStatus : undefined,
        sort: sort === "oldest" ? "date_asc" : sort === "solves" ? "solves_desc" : "date_desc",
      };

      const res = await getGymContests(params);
      if (res.status === "OK") {
        setContests(res.contests);
        setTotalPages(res.totalPages);
        setTotalCount(res.total);
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load contests.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, category, doneStatus, sort]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadContests();
  }, [loadContests]);

  // Handle Done Toggle
  const handleToggleDone = async (contestId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const current = contests.find((c) => c.id === contestId);
    const isCurrentlyDone = Boolean(current?.isDone);
    const contestTitle = current?.name ? ` "${current.name}"` : ` #${contestId}`;
    const confirmMsg = isCurrentlyDone
      ? `Are you sure you want to UNMARK contest${contestTitle} as completed?`
      : `Are you sure you want to MARK contest${contestTitle} as COMPLETED?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await toggleGymContestDone(contestId);
      if (res.status === "OK") {
        setContests((prev) =>
          prev.map((c) => (c.id === contestId ? { ...c, isDone: res.isDone } : c))
        );
        loadStats();
      }
    } catch (err) {
      alert("Failed to toggle done: " + err.message);
    }
  };


  // Handle Sync Newer Contests
  const handleSyncNewer = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      const res = await syncNewerGymContests();
      if (res.status === "OK" || res.status === "SUCCESS") {
        setSyncToast({
          type: "success",
          text: res.message || `Sync completed. ${res.newCount || 0} newer contests found.`,
        });
        await Promise.all([loadStats(), loadContests()]);
      } else if (res.status === "BUSY") {
        setSyncToast({
          type: "info",
          text: res.message || "A sync is already in progress on the server. Please wait...",
        });
      } else {
        setSyncToast({
          type: "error",
          text: res.message || "Failed to fetch newer contests.",
        });
      }
      setTimeout(() => setSyncToast(null), 6000);
    } catch (err) {
      console.error("Sync newer error:", err);
      setSyncToast({
        type: "error",
        text: err?.response?.data?.message || err.message || "Failed to sync newer contests from Codeforces.",
      });
      setTimeout(() => setSyncToast(null), 7000);
    } finally {
      setIsSyncing(false);
    }
  };


  // Handle Fetch/Refresh Problems for a Single Contest
  const handleFetchContestProblems = async (contestId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (fetchingContestId === contestId) return;

    try {
      setFetchingContestId(contestId);
      const res = await fetchGymContestProblems(contestId);
      if (res.status === "OK" && res.contest) {
        setContests((prev) =>
          prev.map((c) => (c.id === contestId ? { ...c, ...res.contest } : c))
        );
        setCopyToast(
          `✓ Updated ${res.contest.problems?.length || 0} problems for Contest #${contestId}`
        );
        setTimeout(() => setCopyToast(null), 3500);
        loadStats();
      } else {
        alert("Could not fetch problems: " + (res.message || "Unknown error"));
      }
    } catch (err) {
      alert("Failed to fetch problem data: " + (err?.response?.data?.message || err.message));
    } finally {
      setFetchingContestId(null);
    }
  };

  // Copy VJudge bulk problem code: `Gym\t|\t${contestId}${p.problemIndex}\t|\t1\t|\t`
  const handleCopyVjudge = async (contest, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    let problems = contest.problems || [];
    if (!problems.length && contest.id) {
      try {
        const res = await fetchGymContestProblems(contest.id);
        if (res.status === "OK" && res.contest?.problems) {
          problems = res.contest.problems;
          // Update state with newly fetched problems
          setContests((prev) =>
            prev.map((c) => (c.id === contest.id ? { ...c, ...res.contest } : c))
          );
        }
      } catch (err) {
        console.warn(err);
      }
    }

    let lines = [];
    if (problems.length > 0) {
      lines = problems.map((p) => `Gym\t|\t${contest.id}${p.problemIndex}\t|\t1\t|\t`);
    } else {
      const count = contest.problemsCount || 0;
      for (let i = 0; i < count; i++) {
        lines.push(`Gym\t|\t${contest.id}${String.fromCharCode(65 + i)}\t|\t1\t|\t`);
      }
    }

    if (lines.length === 0) {
      setCopyToast(`No problems available for Contest #${contest.id}`);
      setTimeout(() => setCopyToast(null), 3000);
      return;
    }

    const textToCopy = lines.join("\n");
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyToast(`✓ Copied ${lines.length} problems for Contest #${contest.id} (VJudge format)!`);
      setTimeout(() => setCopyToast(null), 3500);
    } catch {
      setCopyToast("Clipboard access denied.");
      setTimeout(() => setCopyToast(null), 3000);
    }
  };

  // Filtered contests based on client-side solve presets (if active)
  const displayedContests = useMemo(() => {
    if (!activePreset) return contests;
    return contests.filter((c) => {
      const problems = c.problems || [];
      const { solves, type, probs } = activePreset;
      const count = problems.filter((p) => {
        const s = type === "contest" ? (p.contestSolves || 0) : (p.allTimeSolves || 0);
        return s >= solves;
      }).length;
      return count >= probs;
    });
  }, [contests, activePreset]);

  // Jump page
  const handleJump = (e) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setPage(p);
      setJumpPage("");
    }
  };

  return (
    <div className="contest-setter-container">
      {/* Toast notifications */}
      {syncToast && (
        <div className={`cs-toast ${syncToast.type}`}>
          {syncToast.text}
        </div>
      )}
      {copyToast && (
        <div className="cs-toast success">
          {copyToast}
        </div>
      )}

      {/* ── TOP HEADER (EXACT CONTESTSETTER STYLE) ── */}
      <header className="header">
        <div className="header-content">
          <div className="brand">
            <div className="logo-badge">CF</div>
            <div>
              <h1 className="brand-title">Codeforces Gym Explorer</h1>
              <p className="brand-subtitle">Complete archive of all Gym contests with solve analytics</p>
            </div>
          </div>

          <div className="header-right-group">
            <button
              className={`btn btn-sync ${isSyncing ? "is-syncing" : ""}`}
              onClick={handleSyncNewer}
              disabled={isSyncing}
              title="Check and fetch newer Gym contests from Codeforces"
            >
              {isSyncing ? (
                <>
                  <span className="cs-loading-spinner" aria-hidden="true"></span>
                  <span>Fetching from Codeforces…</span>
                </>
              ) : (
                <>
                  <span className="sync-icon">🔄</span>
                  <span>Fetch Newer Contests</span>
                </>
              )}
            </button>

            <div className="header-stats">
              <div className="stat-badge">
                <span className={`stat-dot ${isSyncing ? "pulse-amber" : "pulse"}`}></span>
                <span className="stat-label">{isSyncing ? "Sync Status:" : "Total Gyms:"}</span>
                <span className="stat-value" style={{ color: isSyncing ? "#f59e0b" : "var(--text-primary)" }}>
                  {isSyncing ? "In Progress…" : (stats?.totalContests?.toLocaleString() || "2,660")}
                </span>
              </div>
              <div className="stat-badge">
                <span className="stat-label">Problems Cached:</span>
                <span className="stat-value">{stats?.cachedContests?.toLocaleString() || "2,660"}</span>
              </div>
              <div className="stat-badge stat-badge-done" title="Contests you marked as completed">
                <span className="stat-label">Done:</span>
                <span className="stat-value highlight-done">{stats?.doneContests?.toLocaleString() || "17"}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── SYNCING IN PROGRESS BANNER ── */}
      {isSyncing && (
        <div className="cs-syncing-banner">
          <div className="cs-syncing-spinner-lg"></div>
          <div className="cs-syncing-text">
            <div className="cs-syncing-title">Fetching Newer Gym Contests from Codeforces API…</div>
            <div className="cs-syncing-desc">
              Contacting Codeforces, querying archive diffs, and syncing metadata. This usually takes 15–25 seconds. This loading status will remain active until the fetch process completes.
            </div>
          </div>
        </div>
      )}


      {/* ── CONTROLS & FILTER BAR ── */}
      <section className="controls-section">
        <div className="controls-bar">
          {/* Search */}
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by contest title or ID (e.g. Waterloo, 104639)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-btn" onClick={() => setSearch("")}>
                ✕
              </button>
            )}
          </div>

          {/* Filter dropdowns */}
          <div className="filter-group">
            <div className="select-wrapper">
              <select
                value={doneStatus}
                onChange={(e) => {
                  setDoneStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Status: All</option>
                <option value="pending">⏳ Undone Only</option>
                <option value="done">✓ Done Only</option>
              </select>
            </div>

            <div className="select-wrapper">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Category: All</option>
                <option value="standard">📈 Standard</option>
                <option value="spike">⚡ Spike</option>
                <option value="equilibrium">⚖️ Equilibrium</option>
              </select>
            </div>

            <div className="select-wrapper">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="recent">Most Recent First</option>
                <option value="oldest">Oldest First</option>
                <option value="solves">Most Solves</option>
              </select>
            </div>

            {/* Solve Filter Button */}
            <button
              type="button"
              className={`btn btn-secondary btn-conditions-toggle ${showConditions ? "active" : ""}`}
              onClick={() => setShowConditions(!showConditions)}
            >
              <span>🎯 Solve Filter</span>
              {activePreset && <span className="badge-pill">1</span>}
              <span className="toggle-arrow">{showConditions ? "▴" : "▾"}</span>
            </button>
          </div>

          {/* Metric Segmented Toggle */}
          <div className="graph-metric-toggle-wrapper">
            <span className="metric-toggle-label">Metric:</span>
            <div className="segmented-control" role="radiogroup">
              <button
                type="button"
                className={`segment-btn ${activeMetric === "all_time" ? "active" : ""}`}
                data-stat="all_time"
                onClick={() => setActiveMetric("all_time")}
                title="Show All-Time solves in all charts"
              >
                <span className="segment-dot all-time-dot"></span>
                <span>All-Time</span>
              </button>
              <button
                type="button"
                className={`segment-btn ${activeMetric === "contest" ? "active" : ""}`}
                data-stat="contest"
                onClick={() => setActiveMetric("contest")}
                title="Show Contest Time solves in all charts"
              >
                <span className="segment-dot contest-dot"></span>
                <span>Contest</span>
              </button>
            </div>
          </div>
        </div>

        {/* Custom Solve Presets Panel */}
        {showConditions && (
          <div className="conditions-panel">
            <div className="conditions-presets">
              <span className="presets-label">Quick Presets:</span>
              {[
                { label: "≥ 200 All-Time Solves on ≥ 4 Problems", solves: 200, type: "all_time", probs: 4 },
                { label: "≥ 50 Contest Solves on ≥ 3 Problems", solves: 50, type: "contest", probs: 3 },
                { label: "≥ 20 Contest Solves on ≥ 5 Problems", solves: 20, type: "contest", probs: 5 },
              ].map((p, idx) => {
                const isSelected = activePreset?.solves === p.solves && activePreset?.type === p.type && activePreset?.probs === p.probs;
                return (
                  <button
                    key={idx}
                    className={`preset-chip ${isSelected ? "active" : ""}`}
                    onClick={() => setActivePreset(isSelected ? null : p)}
                  >
                    {p.label}
                  </button>
                );
              })}
              {activePreset && (
                <button
                  className="preset-chip preset-clear-chip"
                  onClick={() => setActivePreset(null)}
                >
                  Clear Preset ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pagination Strip */}
        <div className="pagination-strip">
          <div className="results-info">
            {loading ? (
              "Loading contests..."
            ) : (
              <>
                Showing <strong className="results-highlight">{displayedContests.length}</strong> of{" "}
                <strong className="results-highlight">{totalCount.toLocaleString()}</strong> contests
                {activePreset && <span style={{ color: "#4f46e5", marginLeft: 6 }}>(Preset Filter Active)</span>}
              </>
            )}
          </div>

          <div className="pagination-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span className="page-btn active">{page}</span>
            <span className="page-ellipsis">/ {totalPages}</span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>

          <form onSubmit={handleJump} className="page-jumper">
            <span>Go to page:</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={jumpPage}
              placeholder="#"
              onChange={(e) => setJumpPage(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-secondary">Go</button>
          </form>
        </div>
      </section>

      {/* ── CONTESTS ROWS LIST (EXACT CONTESTSETTER TEMPLATE) ── */}
      {error && <div className="notice error">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading contests and solve analytics...</p>
        </div>
      ) : displayedContests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No contests found</h3>
          <p>Try refining your search query or reset your filters.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setDoneStatus("all");
              setActivePreset(null);
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="contests-grid">
          {displayedContests.map((contest) => {
            const isDone = Boolean(contest.isDone);
            const cfUrl = `https://codeforces.com/gym/${contest.id}`;
            const standingsUrl = `https://codeforces.com/gym/${contest.id}/standings`;
            const problems = contest.problems || [];
            const problemsCount = problems.length || contest.problemsCount || 0;
            const totalContestSolves = contest.totalContestSolves || 0;
            const totalAllTimeSolves = contest.totalAllTimeSolves || 0;

            // Category badge
            const cat = contest.category || "standard";
            let categoryBadge = null;
            if (cat === "spike") {
              categoryBadge = (
                <span className="badge-category badge-category-spike" title={contest.categoryExplanation || "Spike difficulty: sharp disparity between easy and hard problems"}>
                  ⚡ Spike
                </span>
              );
            } else if (cat === "equilibrium") {
              categoryBadge = (
                <span className="badge-category badge-category-equilibrium" title={contest.categoryExplanation || "Equilibrium difficulty: all problems have nearly uniform difficulty"}>
                  ⚖️ Equilibrium
                </span>
              );
            } else {
              categoryBadge = (
                <span className="badge-category badge-category-standard" title={contest.categoryExplanation || "Standard difficulty: evenly distributed problem difficulty gradient"}>
                  📈 Standard
                </span>
              );
            }

            // Chart metric calculation
            const isContestMetric = activeMetric === "contest";
            const metricSolves = problems.map((p) =>
              isContestMetric ? (p.contestSolves || 0) : (p.allTimeSolves || 0)
            );
            const maxVal = metricSolves.length ? Math.max(...metricSolves) : 0;
            const levels = getNiceThreeLevels(maxVal);
            const topMax = Math.max(maxVal * 1.1, (levels[2] || 0) * 1.15, 1);

            // Chart dimensions
            const chartLeft = 34;
            const chartRight = 265;
            const chartTop = 6;
            const xAxisY = 66;
            const chartWidth = chartRight - chartLeft;
            const chartHeight = xAxisY - chartTop;
            const numProblems = problems.length;
            const slotWidth = numProblems > 0 ? chartWidth / numProblems : 0;
            const barWidth = Math.max(Math.min(slotWidth * 0.72, 16), 3);
            const barColor = isContestMetric ? "#4f46e5" : "#059669";

            return (
              <div
                key={contest.id}
                className={`contest-row ${isDone ? "is-done" : ""}`}
                id={`contest-card-${contest.id}`}
              >
                {/* 1. Left Checkbox Action */}
                <div className="row-left">
                  <button
                    className={`row-done-btn ${isDone ? "is-done" : ""}`}
                    onClick={(e) => handleToggleDone(contest.id, e)}
                    title={isDone ? "Mark as incomplete/undone" : "Mark contest as completed"}
                  >
                    <span className="row-done-check">{isDone ? "✓" : ""}</span>
                  </button>
                </div>

                {/* 2. Main Content Column */}
                <div className="row-main">
                  <div className="row-header">
                    <a href={cfUrl} target="_blank" rel="noopener noreferrer" className="row-id">
                      #{contest.id}
                    </a>
                    <h2 className="row-title">
                      <a href={cfUrl} target="_blank" rel="noopener noreferrer" title={contest.name}>
                        {contest.name}
                      </a>
                    </h2>
                    <div className="row-badges">
                      {categoryBadge}
                      {contest.kind && <span className="badge-tag">{contest.kind}</span>}
                      {contest.season && <span className="badge-tag">{contest.season}</span>}
                      {isDone && <span className="badge-done-tag">Done ✓</span>}
                    </div>
                  </div>

                  <div className="row-meta">
                    <span className="meta-item">📅 {formatDate(contest.startTimeSeconds)}</span>
                    <span className="meta-item">⏱️ {formatDuration(contest.durationSeconds)}</span>
                    {contest.type && <span className="meta-item">🏆 {contest.type}</span>}
                    <span className="meta-divider">•</span>
                    <span className="meta-item">
                      <strong>{problemsCount}</strong> Problems
                    </span>
                    <span className="meta-divider">•</span>
                    <span className="meta-item meta-contest-solves">
                      <strong>{totalContestSolves.toLocaleString()}</strong> Contest Solves
                    </span>
                    <span className="meta-divider">•</span>
                    <span className="meta-item meta-all-solves">
                      <strong>{totalAllTimeSolves.toLocaleString()}</strong> All-Time
                    </span>
                  </div>

                  {/* Problem Chips */}
                  <div className="row-problems">
                    {problems.length === 0 ? (
                      <div className="no-problems-wrapper">
                        <span className="no-problems-hint">No problems data</span>
                        <button
                          type="button"
                          className="cs-fetch-prob-btn"
                          onClick={(e) => handleFetchContestProblems(contest.id, e)}
                          disabled={fetchingContestId === contest.id}
                          title="Fetch problem stats from Codeforces"
                        >
                          {fetchingContestId === contest.id ? "Fetching…" : "🔄 Fetch Problems"}
                        </button>
                      </div>
                    ) : (
                      problems.map((p) => {
                        const s = isContestMetric ? (p.contestSolves || 0) : (p.allTimeSolves || 0);
                        const url = `https://codeforces.com/gym/${contest.id}/problem/${p.problemIndex}`;
                        return (
                          <a
                            key={p.problemIndex}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="problem-chip"
                            title={`${p.problemIndex} - ${p.name} | Contest Solves: ${p.contestSolves || 0} | All-time: ${p.allTimeSolves || 0}`}
                          >
                            <span className="chip-index">{p.problemIndex}</span>
                            <span className="chip-solves">{s.toLocaleString()}</span>
                          </a>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 3. Inline Sparkline Chart Column */}
                <div className="row-chart-column">
                  <div className="row-chart-header">
                    <div className="row-chart-legend">
                      <span className={`legend-color-dot ${isContestMetric ? "contest" : "all-time"}`}></span>
                      <span className="row-chart-label">
                        {isContestMetric ? "Contest Solves" : "All-Time Solves"}
                      </span>
                    </div>
                  </div>

                  <div className="row-chart-wrapper">
                    {problems.length === 0 ? (
                      <div className="no-chart-data">No problems data</div>
                    ) : maxVal === 0 ? (
                      <div className="zero-metric-notice">
                        <div className="zero-notice-title">0 Solves Recorded</div>
                        <div className="zero-notice-subtitle">No solve submissions recorded on CF</div>
                      </div>
                    ) : (
                      <svg
                        viewBox={`0 0 ${chartRight + 6} 78`}
                        className="sparkline-svg"
                      >
                        {/* 3 horizontal gray dotted lines */}
                        {levels.map((val, idx) => {
                          if (!val) return null;
                          const yPixel = xAxisY - (val / topMax) * chartHeight;
                          if (yPixel < chartTop - 1 || yPixel > xAxisY - 3) return null;
                          return (
                            <g key={idx}>
                              <line
                                x1={chartLeft}
                                y1={yPixel.toFixed(1)}
                                x2={chartRight}
                                y2={yPixel.toFixed(1)}
                                className="sparkline-grid-line"
                                strokeWidth="1"
                                strokeDasharray="3,3"
                              />
                              <text
                                x={chartLeft - 4}
                                y={(yPixel + 3).toFixed(1)}
                                className="sparkline-label"
                                fontFamily="'JetBrains Mono', monospace"
                                fontSize="8"
                                fontWeight="600"
                                textAnchor="end"
                              >
                                {formatShortNumber(val)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Baseline */}
                        <line
                          x1={chartLeft}
                          y1={xAxisY}
                          x2={chartRight}
                          y2={xAxisY}
                          className="sparkline-baseline"
                          strokeWidth="1"
                        />

                        {/* Problem bars and bottom letters */}
                        {problems.map((p, i) => {
                          const val = metricSolves[i] || 0;
                          const slotCenter = chartLeft + (i + 0.5) * slotWidth;
                          const barX = slotCenter - barWidth / 2;
                          const bHeight = Math.max((val / topMax) * chartHeight, val > 0 ? 2 : 0);
                          const barY = xAxisY - bHeight;

                          return (
                            <g key={p.problemIndex} className="svg-bar-group">
                              <rect
                                x={barX.toFixed(1)}
                                y={barY.toFixed(1)}
                                width={barWidth.toFixed(1)}
                                height={bHeight.toFixed(1)}
                                fill={barColor}
                                rx="1.5"
                                className="svg-bar"
                              >
                                <title>{`${p.problemIndex}: ${val.toLocaleString()} solves`}</title>
                              </rect>
                              <text
                                x={slotCenter.toFixed(1)}
                                y="76"
                                className="sparkline-label"
                                fontFamily="'JetBrains Mono', monospace"
                                fontSize="8"
                                fontWeight="600"
                                textAnchor="middle"
                              >
                                {p.problemIndex}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    )}
                  </div>
                </div>

                {/* 4. Actions Column */}
                <div className="row-actions">
                  <button
                    type="button"
                    className={`row-btn-link cs-refresh-btn ${fetchingContestId === contest.id ? "is-spinning" : ""}`}
                    onClick={(e) => handleFetchContestProblems(contest.id, e)}
                    disabled={fetchingContestId === contest.id}
                    title="Re-fetch / refresh problem data from Codeforces"
                  >
                    {fetchingContestId === contest.id ? "⏳ Fetching…" : "🔄 Refresh"}
                  </button>
                  <button
                    className="row-btn-link copy-vjudge-btn"
                    onClick={(e) => handleCopyVjudge(contest, e)}
                    title="Copy contest problems in VJudge format"
                  >
                    📋 VJudge
                  </button>
                  <a
                    href={cfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="row-btn-link"
                    title="Open Contest in Codeforces Gym"
                  >
                    Gym ↗
                  </a>
                  <a
                    href={standingsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="row-btn-link"
                    title="Open Standings"
                  >
                    Standings ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── BOTTOM PAGINATION ── */}
      {!loading && totalPages > 1 && (
        <div className="bottom-pagination-container" style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          <div className="pagination-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
            <span className="page-btn active">{page}</span>
            <span className="page-ellipsis">/ {totalPages}</span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      )}
    </div>
  );
};
