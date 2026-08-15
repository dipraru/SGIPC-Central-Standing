import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getStandings,
  getTfcStandings,
  getTfcParticipants,
  submitTfcRequest,
} from "../api.js";
import { BatchSelect } from "../components/BatchSelect.jsx";
import { computeBatchOptions, SortIcon } from "./Standings.jsx";

const TFC_TAB_KEY = "sgipc_tfc_tab";
const getInitialTfcTab = () => {
  try { return sessionStorage.getItem(TFC_TAB_KEY) || "standings"; } catch { return "standings"; }
};
const saveTfcTab = (tab) => {
  try { sessionStorage.setItem(TFC_TAB_KEY, tab); } catch {}
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
  const switchTab = (t) => { setActiveTab(t); saveTfcTab(t); };

  // ── Standings data ─────────────────────────────────────────────────────────
  const [standings, setStandings] = useState([]);
  const [standingsMap, setStandingsMap] = useState({ normal: [], "gain-only": [], "zero-participation": [] });
  const [contests, setContests] = useState([]);
  const [selectedType, setSelectedType] = useState("normal");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Participants directory data ────────────────────────────────────────────
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // ── Modals & filters ───────────────────────────────────────────────────────
  const [contestsModalOpen, setContestsModalOpen] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [batchFilterOpen, setBatchFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [sortField, setSortField] = useState("rank");
  const [sortDir, setSortDir] = useState("asc");

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

  // Fetch TFC Standings
  const fetchStandings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTfcStandings();
      if (data.standingsByType) {
        setStandingsMap(data.standingsByType);
      }
      setStandings(data.standings || []);
      setContests(data.contests || []);
      setError("");
    } catch (err) {
      setError("Unable to load TFC standings.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch TFC Participants
  const fetchParticipants = useCallback(async () => {
    try {
      setParticipantsLoading(true);
      const data = await getTfcParticipants();
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

  // Dynamic Batch options (combines central standings, TFC standings and participants)
  const formBatchOptions = useMemo(() => {
    return computeBatchOptions([...centralStandings, ...standings], participants, []);
  }, [centralStandings, standings, participants]);

  const availableBatches = useMemo(() => {
    const s = new Set();
    const source = activeTab === "standings" ? (standingsMap[selectedType] || standings) : participants;
    source.forEach((r) => {
      const b = normalizeBatch(r.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort((a, b) => {
      const na = parseInt(extractBatchDigits(a) || "0", 10);
      const nb = parseInt(extractBatchDigits(b) || "0", 10);
      return nb - na;
    });
  }, [activeTab, standingsMap, selectedType, standings, participants]);

  // Filtered standings
  const displayedStandings = useMemo(() => {
    const rawList = standingsMap[selectedType] || standings;
    let list = rawList.slice();

    if (selectedBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && selectedBatches.includes(b);
      });
    }

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

    return list;
  }, [standingsMap, selectedType, standings, selectedBatches, searchQuery, sortField, sortDir]);

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
              <h2>TFC Rankings</h2>
              <p className="card-subtitle">
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
              <div className="filter-section">
                <button className="secondary sm" onClick={() => setBatchFilterOpen(!batchFilterOpen)}>
                  🎓 Batch
                  {selectedBatches.length > 0 && (
                    <span style={{ marginLeft: 5, background: "var(--primary)", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>
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
                    placeholder="Search contestant or roll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>×</button>}
                </div>
              </div>
            </div>
          )}

          {batchFilterOpen && availableBatches.length > 0 && (
            <div className="batch-dropdown">
              {availableBatches.map((b) => (
                <label key={b} className={`batch-checkbox-label ${selectedBatches.includes(b) ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selectedBatches.includes(b)}
                    onChange={() => toggleBatch(b)}
                    style={{ width: "auto", accentColor: "var(--primary)" }}
                  />
                  {b}
                </label>
              ))}
            </div>
          )}

          {loading && <div className="empty-state"><div className="loading-spinner" /><p>Loading TFC standings...</p></div>}
          {!loading && error && <div className="notice error">{error}</div>}
          {!loading && !error && displayedStandings.length === 0 && (
            <div className="empty-state"><p>No TFC contestant standings found.</p></div>
          )}

          {!loading && !error && displayedStandings.length > 0 && (
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
                {displayedStandings.map((row) => (
                  <tr key={row.id}>
                    <td data-label="#"><div className={`rank-badge ${rankCls(row.rank)}`}>{row.rank}</div></td>
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
                    <td data-label="Contests" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {row.contests}
                    </td>
                    <td data-label="Rating">
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)", fontSize: 15 }}>
                        {row.ratingDisplay}
                      </span>
                    </td>
                    <td data-label="Videos" style={{ textAlign: "center" }}>
                      <button
                        className="secondary xs"
                        onClick={() => navigate(`/tfc/contestant/${row.id}`)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                      >
                        🎥 Recordings &gt;
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
              <div className="filter-section">
                <button className="secondary sm" onClick={() => setBatchFilterOpen(!batchFilterOpen)}>
                  🎓 Batch
                  {selectedBatches.length > 0 && (
                    <span style={{ marginLeft: 5, background: "var(--primary)", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>
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
                    placeholder="Search by contestant or roll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>×</button>}
                </div>
              </div>
            </div>
          )}

          {batchFilterOpen && availableBatches.length > 0 && (
            <div className="batch-dropdown">
              {availableBatches.map((b) => (
                <label key={b} className={`batch-checkbox-label ${selectedBatches.includes(b) ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selectedBatches.includes(b)}
                    onChange={() => toggleBatch(b)}
                    style={{ width: "auto", accentColor: "var(--primary)" }}
                  />
                  {b}
                </label>
              ))}
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
                  onClick={() => navigate(`/tfc/contestant/${p._id}`)}
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
    </div>
  );
};

export default TfcCorner;
