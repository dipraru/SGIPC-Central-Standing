import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getHandles,
  createHandle,
  updateHandle,
  deleteHandle,
  forceRefreshHandle,
  getVjudgeTeams,
  createVjudgeTeam,
  updateVjudgeTeam,
  deleteVjudgeTeam,
  refreshVjudgeTeam,
  getVjudgeContests,
  createVjudgeContest,
  updateVjudgeContest,
  deleteVjudgeContest,
  syncVjudgeContests,
  syncVjudgeContest,
  getVjudgeConfig,
  updateVjudgeConfig,
  getRequests,
  approveRequest,
  rejectRequest,
  updatePasskey,
  updateAdminCredentials,
  verifyAdminAuth,
  getVjudgeStandings,
} from "../api.js";
import { ContestSetterAdmin } from "../components/ContestSetterAdmin.jsx";

const normalizeBatch = (b) => {
  const m = (b || "").match(/(\d{2})$/);
  return m ? `2K${m[1]}` : b || "";
};

const emptyMember = () => ({ name: "", roll: "", batch: "" });

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("handles"); // 'handles' | 'teams' | 'requests' | 'contestSetter'

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

  // Handles state
  const [handles, setHandles] = useState([]);
  const [handlesLoading, setHandlesLoading] = useState(true);
  const [handleSearch, setHandleSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("all");

  // Teams & Contests state
  const [teams, setTeams] = useState([]);
  const [contests, setContests] = useState([]);
  const [vjudgeConfig, setVjudgeConfig] = useState({ eloMode: "normal" });
  const [teamsLoading, setTeamsLoading] = useState(true);

  // Requests state
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestFilter, setRequestFilter] = useState("pending"); // 'pending' | 'approved' | 'rejected' | 'all'
  const [teamSearch, setTeamSearch] = useState("");

  // Modals state
  const [addHandleModal, setAddHandleModal] = useState(false);
  const [editingHandle, setEditingHandle] = useState(null);
  const [addTeamModal, setAddTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [addContestModal, setAddContestModal] = useState(false);
  const [credModal, setCredModal] = useState(false);

  // Form states for Handle
  const [hHandle, setHHandle] = useState("");
  const [hName, setHName] = useState("");
  const [hRoll, setHRoll] = useState("");
  const [hBatch, setHBatch] = useState("");
  const [hInactive, setHInactive] = useState(false);
  const [hLoading, setHLoading] = useState(false);
  const [hError, setHError] = useState("");

  // Form states for Team
  const [tName, setTName] = useState("");
  const [tVjHandle, setTVjHandle] = useState("");
  const [tMembers, setTMembers] = useState([emptyMember(), emptyMember(), emptyMember()]);
  const [tLoading, setTLoading] = useState(false);
  const [tError, setTError] = useState("");

  // Form states for Contest
  const [cId, setCId] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [cError, setCError] = useState("");

  // Passkey state
  const [newPasskey, setNewPasskey] = useState("");
  const [passkeyMsg, setPasskeyMsg] = useState("");

  // Admin Password / Creds
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [credLoading, setCredLoading] = useState(false);
  const [credError, setCredError] = useState("");
  const [credSuccess, setCredSuccess] = useState("");

  // Single handle refreshing
  const [refreshingHandle, setRefreshingHandle] = useState(null);
  const [syncingContests, setSyncingContests] = useState(false);
  const [togglingContestId, setTogglingContestId] = useState(null);
  const [dashboardError, setDashboardError] = useState("");

  // ── Load Handles ──
  const loadHandles = useCallback(async () => {
    try {
      setHandlesLoading(true);
      setDashboardError("");
      const data = await getHandles();
      if (Array.isArray(data)) setHandles(data);
    } catch (e) {
      console.error(e);
      if (e?.response?.status === 401) {
        localStorage.removeItem("sgipc_token");
        window.location.href = "/admin";
      } else {
        setDashboardError(e?.response?.data?.message || e.message || "Failed to load handles.");
      }
    } finally {
      setHandlesLoading(false);
    }
  }, []);

  // ── Load Teams & Contests ──
  const loadTeams = useCallback(async () => {
    try {
      setTeamsLoading(true);
      const [tData, cData, cfg, stdData] = await Promise.allSettled([
        getVjudgeTeams(),
        getVjudgeContests(),
        getVjudgeConfig(),
        getVjudgeStandings(),
      ]);
      const standingsList = stdData.status === "fulfilled" ? (stdData.value?.standings || []) : [];
      if (tData.status === "fulfilled" && Array.isArray(tData.value)) {
        const enriched = tData.value.map((t) => {
          const tName = t.name || t.teamName || "Unnamed Team";
          const st = standingsList.find((s) => s.name === tName || s.aliases?.includes(tName));
          return {
            ...t,
            name: tName,
            teamName: tName,
            teamVjudgeHandle: t.aliases?.[0] || t.teamVjudgeHandle || tName,
            rating: st ? Math.round(st.rating) : t.rating || 1500,
            contestsCount: st ? (st.contests ?? st.contestsHistory?.length ?? 0) : 0,
          };
        });
        setTeams(enriched);
      }
      if (cData.status === "fulfilled" && Array.isArray(cData.value)) setContests(cData.value);
      if (cfg.status === "fulfilled" && cfg.value) setVjudgeConfig(cfg.value);
    } catch (e) {
      console.error(e);
      if (e?.response?.status === 401) {
        localStorage.removeItem("sgipc_token");
        window.location.href = "/admin";
      }
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  // ── Load Requests ──
  const loadRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const data = await getRequests();
      if (Array.isArray(data)) setRequests(data);
    } catch (e) {
      console.error(e);
      if (e?.response?.status === 401) {
        localStorage.removeItem("sgipc_token");
        window.location.href = "/admin";
      }
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  // ── Toggle Contest Enabled ──
  const handleToggleContest = async (contest) => {
    if (!contest) return;
    const cid = contest._id || contest.contestId;
    const nextEnabled = !contest.enabled;
    const contestTitle = contest.title || `Contest #${contest.contestId || cid}`;
    const confirmMsg = nextEnabled
      ? `Include "${contestTitle}" in team Elo rating calculation?`
      : `Exclude "${contestTitle}" from team Elo rating calculation?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setTogglingContestId(cid);
      // Optimistic update

      setContests((prev) =>
        prev.map((c) => (c._id === contest._id || c.contestId === contest.contestId ? { ...c, enabled: nextEnabled } : c))
      );
      await updateVjudgeContest(cid, { enabled: nextEnabled });
      await loadTeams();
    } catch (err) {
      alert("Failed to toggle contest: " + (err?.response?.data?.message || err.message));
      await loadTeams();
    } finally {
      setTogglingContestId(null);
    }
  };

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        await verifyAdminAuth();
      } catch (e) {
        localStorage.removeItem("sgipc_token");
        window.location.href = "/admin";
        return;
      }
      loadHandles();
      loadTeams();
      loadRequests();
    };
    checkAuthAndLoad();
  }, [loadHandles, loadTeams, loadRequests]);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("sgipc_token");
    window.location.href = "/";
  };

  // ── Handle CRUD ──
  const handleSaveHandle = async (e) => {
    e.preventDefault();
    setHError("");
    setHLoading(true);
    try {
      const payload = {
        handle: hHandle.trim(),
        name: hName.trim(),
        roll: hRoll.trim(),
        batch: hBatch.trim().toUpperCase(),
        isInactive: hInactive,
      };

      if (editingHandle) {
        await updateHandle(editingHandle._id, payload);
      } else {
        await createHandle(payload);
      }
      setAddHandleModal(false);
      setEditingHandle(null);
      await loadHandles();
    } catch (err) {
      setHError(err?.response?.data?.message || "Failed to save participant.");
    } finally {
      setHLoading(false);
    }
  };

  const handleDeleteHandle = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await deleteHandle(id);
      await loadHandles();
    } catch (err) {
      alert("Failed to delete: " + err.message);
    }
  };

  const handleForceRefresh = async (id, handle) => {
    try {
      setRefreshingHandle(handle);
      await forceRefreshHandle(id);
      await loadHandles();
    } catch (err) {
      alert("Refresh failed: " + err.message);
    } finally {
      setRefreshingHandle(null);
    }
  };

  // ── Team CRUD ──
  const handleSaveTeam = async (e) => {
    e.preventDefault();
    setTError("");
    setTLoading(true);
    try {
      const cleanName = tName.trim();
      const cleanVj = tVjHandle.trim();
      const payload = {
        name: cleanName,
        teamName: cleanName,
        aliases: cleanVj ? [cleanVj] : [cleanName],
        teamVjudgeHandle: cleanVj || cleanName,
        members: tMembers.map((m) => ({
          name: m.name.trim(),
          roll: m.roll.trim(),
          batch: m.batch.trim().toUpperCase(),
        })),
      };

      if (editingTeam) {
        await updateVjudgeTeam(editingTeam._id, payload);
      } else {
        await createVjudgeTeam(payload);
      }
      setAddTeamModal(false);
      setEditingTeam(null);
      await loadTeams();
    } catch (err) {
      setTError(err?.response?.data?.message || "Failed to save team.");
    } finally {
      setTLoading(false);
    }
  };

  const handleDeleteTeam = async (id, name) => {
    if (!window.confirm(`Delete team "${name}"?`)) return;
    try {
      await deleteVjudgeTeam(id);
      await loadTeams();
    } catch (err) {
      alert("Failed to delete team: " + err.message);
    }
  };

  // ── Contest CRUD ──
  const handleSaveContest = async (e) => {
    e.preventDefault();
    setCError("");
    setCLoading(true);
    try {
      await createVjudgeContest({
        contestId: parseInt(cId, 10),
        title: cTitle.trim(),
      });
      setAddContestModal(false);
      setCId("");
      setCTitle("");
      await loadTeams();
    } catch (err) {
      setCError(err?.response?.data?.message || "Failed to add contest.");
    } finally {
      setCLoading(false);
    }
  };

  const handleDeleteContest = async (id, title) => {
    if (!window.confirm(`Delete contest ${title}?`)) return;
    try {
      await deleteVjudgeContest(id);
      await loadTeams();
    } catch (err) {
      alert("Failed to delete contest: " + err.message);
    }
  };

  const handleSyncAllContests = async () => {
    try {
      setSyncingContests(true);
      await syncVjudgeContests();
      await loadTeams();
      alert("All contests synced from VJudge!");
    } catch (err) {
      alert("Sync failed: " + err.message);
    } finally {
      setSyncingContests(false);
    }
  };

  // ── Requests Actions ──
  const handleApproveReq = async (id) => {
    try {
      await approveRequest(id);
      await loadRequests();
      await loadHandles();
      await loadTeams();
    } catch (err) {
      alert("Approval failed: " + err.message);
    }
  };

  const handleRejectReq = async (id) => {
    try {
      await rejectRequest(id);
      await loadRequests();
    } catch (err) {
      alert("Rejection failed: " + err.message);
    }
  };

  // ── Passkey Update ──
  const handleUpdatePasskey = async (e) => {
    e.preventDefault();
    setPasskeyMsg("");
    try {
      await updatePasskey({ passkey: newPasskey.trim() });
      setPasskeyMsg("✓ Passkey updated successfully!");
      setNewPasskey("");
    } catch (err) {
      setPasskeyMsg("Failed to update passkey.");
    }
  };

  // ── Admin Password Change ──
  const handleChangeAdminPassword = async (e) => {
    e.preventDefault();

    setCredError("");
    setCredSuccess("");

    if (!currentPassword) {
      setCredError("Current password is required.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setCredError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setCredError("New passwords do not match.");
      return;
    }

    try {
      setCredLoading(true);
      const res = await updateAdminCredentials({
        currentPassword,
        newPassword,
      });
      if (res.token) {
        localStorage.setItem("sgipc_token", res.token);
      }
      setCredSuccess("✓ Admin password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setTimeout(() => {
        setCredModal(false);
        setCredSuccess("");
      }, 1800);
    } catch (err) {
      setCredError(err?.response?.data?.message || err.message || "Failed to update password.");
    } finally {
      setCredLoading(false);
    }
  };

  // ── Filtered Handles ──

  const filteredHandles = useMemo(() => {
    let list = [...handles];
    if (handleSearch.trim()) {
      const q = handleSearch.trim().toLowerCase();
      list = list.filter(
        (h) =>
          h.name?.toLowerCase().includes(q) ||
          h.handle?.toLowerCase().includes(q) ||
          h.roll?.toLowerCase().includes(q)
      );
    }
    if (selectedBatch !== "all") {
      list = list.filter((h) => normalizeBatch(h.batch) === selectedBatch);
    }
    return list;
  }, [handles, handleSearch, selectedBatch]);

  const batches = useMemo(() => {
    const s = new Set();
    handles.forEach((h) => {
      const b = normalizeBatch(h.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort().reverse();
  }, [handles]);

  const pendingRequests = useMemo(() => requests.filter((r) => !r.status || r.status === "pending"), [requests]);
  const approvedRequests = useMemo(() => requests.filter((r) => r.status === "approved"), [requests]);
  const rejectedRequests = useMemo(() => requests.filter((r) => r.status === "rejected"), [requests]);
  const pendingRequestsCount = pendingRequests.length;

  const displayedRequests = useMemo(() => {
    if (requestFilter === "pending") return pendingRequests;
    if (requestFilter === "approved") return approvedRequests;
    if (requestFilter === "rejected") return rejectedRequests;
    return requests;
  }, [requests, requestFilter, pendingRequests, approvedRequests, rejectedRequests]);

  const filteredTeams = useMemo(() => {
    if (!teamSearch.trim()) return teams;
    const q = teamSearch.toLowerCase().trim();
    return teams.filter((t) => {
      const name = (t.name || t.teamName || "").toLowerCase();
      const handle = (t.teamVjudgeHandle || t.aliases?.[0] || "").toLowerCase();
      const membersMatch = (t.members || []).some(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.roll?.toLowerCase().includes(q) ||
          m.batch?.toLowerCase().includes(q)
      );
      return name.includes(q) || handle.includes(q) || membersMatch;
    });
  }, [teams, teamSearch]);

  return (
    <div className="admin-layout-redesign">
      {/* ── TOP ADMIN NAV ── */}
      <header className="adm-header">
        <div className="adm-header-inner">
          <div className="adm-brand">
            <div className="adm-badge">
              <img src="/logo.png" alt="SGIPC" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }} />
            </div>
            <div>
              <h1 className="adm-brand-title">SGIPC Admin Console</h1>
              <div className="adm-status-row">
                <span className="adm-status-dot"></span>
                <span>Production Database Connected</span>
              </div>
            </div>
          </div>

          <div className="adm-nav-tabs">
            <button
              className={`adm-tab ${activeTab === "handles" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("handles");
                loadHandles();
              }}
            >
              🏆 Individual Handles
            </button>

            <button
              className={`adm-tab ${activeTab === "teams" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("teams");
                loadTeams();
              }}
            >
              👥 Teams &amp; Contests
            </button>

            <button
              className={`adm-tab ${activeTab === "requests" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("requests");
                loadRequests();
              }}
            >
              📥 Requests
              {pendingRequestsCount > 0 && (
                <span className="adm-badge-count">{pendingRequestsCount}</span>
              )}
            </button>

            <button
              className={`adm-tab ${activeTab === "contestSetter" ? "active" : ""}`}
              onClick={() => setActiveTab("contestSetter")}
            >
              🎯 Contest Setter Hub
            </button>
          </div>

          <div className="adm-actions">
            <button
              className="adm-theme-toggle"
              onClick={() => {
                setCredError("");
                setCredSuccess("");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmNewPassword("");
                setCredModal(true);
              }}
              title="Change Admin Password"
            >
              <span>🔒 Password</span>
            </button>
            <button
              className="adm-theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              aria-label="Toggle theme"
            >
              <span>{theme === "dark" ? "☀️ Light" : "🌙 Dark"}</span>
            </button>
            <a href="/" target="_blank" rel="noopener noreferrer" className="adm-btn-site" title="View live public site">
              Live Standings ↗
            </a>
            <button className="adm-btn-logout" onClick={handleLogout}>
              Sign Out
            </button>
          </div>

        </div>
      </header>

      {/* ── MAIN DASHBOARD CONTAINER ── */}
      <main className="adm-content">
        {/* ══════════════════════════════════════════════════════════════════
            TAB 1: INDIVIDUAL HANDLES MANAGEMENT
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "handles" && (
          <div className="adm-card">
            {/* Header */}
            <div className="adm-card-header">
              <div>
                <h2>Codeforces Participants ({filteredHandles.length})</h2>
                <p>Manage participant handles, sync ratings, and toggle active status</p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="secondary sm" onClick={loadHandles} disabled={handlesLoading}>
                  {handlesLoading ? "Refreshing…" : "↻ Reload"}
                </button>
                <button
                  className="primary sm"
                  onClick={() => {
                    setEditingHandle(null);
                    setHHandle("");
                    setHName("");
                    setHRoll("");
                    setHBatch("");
                    setHInactive(false);
                    setHError("");
                    setAddHandleModal(true);
                  }}
                >
                  ＋ Add Participant
                </button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="adm-filter-bar">
              <div style={{ flex: "1 1 240px" }}>
                <input
                  type="text"
                  placeholder="Filter by name, roll, or handle..."
                  value={handleSearch}
                  onChange={(e) => setHandleSearch(e.target.value)}
                  className="adm-input"
                />
              </div>

              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="adm-select"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Handles Table */}
            {handlesLoading ? (
              <div className="adm-loading">Loading handles…</div>
            ) : filteredHandles.length === 0 ? (
              <div className="adm-empty">No participants match the filter.</div>
            ) : (
              <div className="table-wrapper">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Participant Name</th>
                      <th>CF Handle</th>
                      <th style={{ textAlign: "center" }}>Roll &amp; Batch</th>
                      <th style={{ textAlign: "center" }}>Rating</th>
                      <th style={{ textAlign: "center" }}>Max Rating</th>
                      <th style={{ textAlign: "center" }}>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHandles.map((h) => (
                      <tr key={h._id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{h.name || "—"}</div>
                        </td>
                        <td>
                          <a
                            href={`https://codeforces.com/profile/${h.handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="std-cf-link"
                          >
                            <span>{h.handle}</span>
                            <span style={{ fontSize: 9 }}>↗</span>
                          </a>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="std-roll-pill">{h.roll || "—"}</span>{" "}
                          <span className="std-batch-text">{normalizeBatch(h.batch) || h.batch}</span>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, color: "var(--primary)" }}>
                          {h.standingRating ?? h.rating ?? 1000}
                        </td>
                        <td style={{ textAlign: "center", color: "var(--text-muted)" }}>
                          {h.maxRating || "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`adm-status-pill ${h.isInactive ? "inactive" : "active"}`}>
                            {h.isInactive ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              className="secondary xs"
                              onClick={() => handleForceRefresh(h._id, h.handle)}
                              disabled={refreshingHandle === h.handle}
                              title="Force refresh Codeforces stats"
                            >
                              {refreshingHandle === h.handle ? "…" : "↻ Sync"}
                            </button>
                            <button
                              className="secondary xs"
                              onClick={() => {
                                setEditingHandle(h);
                                setHHandle(h.handle);
                                setHName(h.name || "");
                                setHRoll(h.roll || "");
                                setHBatch(h.batch || "");
                                setHInactive(h.isInactive || false);
                                setAddHandleModal(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="danger xs"
                              onClick={() => handleDeleteHandle(h._id, h.name || h.handle)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2: TEAMS & CONTESTS MANAGEMENT (REDESIGNED MINIMAL UI)
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "teams" && (
          <div style={{ display: "grid", gap: 20 }}>
            {/* Top Stat Summary Cards */}
            <div className="adm-stat-cards">
              <div className="adm-stat-card">
                <div>
                  <div className="adm-stat-card-title">Registered Teams</div>
                  <div className="adm-stat-card-value">{teams.length}</div>
                </div>
                <div className="adm-stat-card-desc">Official 3-member squads active in standings</div>
              </div>

              <div className="adm-stat-card">
                <div>
                  <div className="adm-stat-card-title">Counted In-Elo Contests</div>
                  <div className="adm-stat-card-value">
                    {contests.filter((c) => c.enabled).length}{" "}
                    <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-muted)" }}>
                      / {contests.length}
                    </span>
                  </div>
                </div>
                <div className="adm-stat-card-desc">Contests actively weighted in team calculations</div>
              </div>

              <div className="adm-stat-card">
                <div>
                  <div className="adm-stat-card-title">Elo Calculation Formula</div>
                  <div style={{ marginTop: 6, marginBottom: 8 }}>
                    <select
                      value={vjudgeConfig.eloMode || "normal"}
                      onChange={async (e) => {
                        const mode = e.target.value;
                        setVjudgeConfig((prev) => ({ ...prev, eloMode: mode }));
                        await updateVjudgeConfig({ eloMode: mode });
                        await loadTeams();
                      }}
                      className="adm-select"
                      style={{ width: "100%", fontWeight: 600 }}
                    >
                      <option value="normal">Normal Mode (Gradual Elo Scaling)</option>
                      <option value="hardcore">Hardcore Mode (Strict ICPC Penalties)</option>
                      <option value="rapid">Rapid Mode (High Volatility)</option>
                    </select>
                  </div>
                </div>
                <div className="adm-stat-card-desc">Applied dynamically to all team rankings</div>
              </div>
            </div>

            {/* Teams Table Card */}
            <div className="adm-card">
              <div className="adm-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2>VJudge Teams ({filteredTeams.length})</h2>
                  <p>Official team rosters, handles, and live calculated ratings</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Search teams, handles, members..."
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="adm-input"
                    style={{ width: 240 }}
                  />
                  <button
                    className="primary sm"
                    onClick={() => {
                      setEditingTeam(null);
                      setTName("");
                      setTVjHandle("");
                      setTMembers([emptyMember(), emptyMember(), emptyMember()]);
                      setAddTeamModal(true);
                    }}
                  >
                    ＋ Add Team
                  </button>
                </div>
              </div>

              {teamsLoading ? (
                <div className="adm-loading">Loading teams data…</div>
              ) : filteredTeams.length === 0 ? (
                <div className="adm-empty">
                  {teamSearch ? `No teams found matching "${teamSearch}".` : "No teams registered yet. Click '＋ Add Team' to create one."}
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Team Name &amp; Handle</th>
                        <th>Members (Roll, Batch)</th>
                        <th style={{ textAlign: "center" }}>Contests</th>
                        <th style={{ textAlign: "center" }}>Elo Rating</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeams.map((t, idx) => {
                        const teamName = t.name || t.teamName || "Unnamed Team";
                        const teamHandle = t.teamVjudgeHandle || t.aliases?.[0] || teamName;
                        return (
                          <tr key={t._id || idx}>
                            <td>
                              <div className="adm-team-row">
                                <div className="adm-team-avatar">
                                  {teamName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="adm-team-title">{teamName}</div>
                                  <div className="adm-team-subtitle">
                                    <a
                                      href={`https://vjudge.net/user/${teamHandle}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="std-cf-link"
                                    >
                                      @{teamHandle} ↗
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {(t.members || []).map((m, mIdx) => (
                                  <span key={mIdx} className="std-member-chip">
                                    {m.name} ({m.roll || m.batch || "—"})
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="std-batch-pill">
                                {t.contestsCount ?? 0} {t.contestsCount === 1 ? "contest" : "contests"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  fontSize: 13,
                                  color: (t.rating || 1500) >= 1600 ? "var(--accent)" : "var(--primary)",
                                  background: "var(--bg-subtle)",
                                  padding: "4px 10px",
                                  borderRadius: 8,
                                  border: "1px solid var(--border-subtle)",
                                }}
                              >
                                {Math.round(t.rating || 1500)}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                <button
                                  className="secondary xs"
                                  onClick={() => {
                                    setEditingTeam(t);
                                    setTName(teamName);
                                    setTVjHandle(teamHandle);
                                    setTMembers(
                                      t.members?.length === 3
                                        ? t.members
                                        : [emptyMember(), emptyMember(), emptyMember()]
                                    );
                                    setAddTeamModal(true);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="danger xs"
                                  onClick={() => handleDeleteTeam(t._id, teamName)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Contests Management Card */}
            <div className="adm-card">
              <div className="adm-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2>VJudge Team Contests ({contests.length})</h2>
                  <p>Toggle contest participation to automatically recalculate team Elo ratings</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="secondary sm"
                    onClick={handleSyncAllContests}
                    disabled={syncingContests}
                  >
                    {syncingContests ? "Syncing Ranks…" : "🔄 Sync Standings from VJudge"}
                  </button>
                  <button className="primary sm" onClick={() => setAddContestModal(true)}>
                    ＋ Add Contest
                  </button>
                </div>
              </div>

              {contests.length === 0 ? (
                <div className="adm-empty">No contests added yet. Click &quot;＋ Add Contest&quot; to begin.</div>
              ) : (
                <div className="table-wrapper">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th style={{ width: 140 }}>Contest ID</th>
                        <th>Contest Title</th>
                        <th style={{ textAlign: "center" }}>Elo Weighting Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contests.map((c) => (
                        <tr key={c._id || c.contestId}>
                          <td>
                            <a
                              href={`https://vjudge.net/contest/${c.contestId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="std-cf-link"
                              style={{ fontWeight: 700 }}
                            >
                              #{c.contestId} ↗
                            </a>
                          </td>
                          <td>
                            <strong>{c.title || `Contest #${c.contestId}`}</strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              className={`adm-contest-toggle ${c.enabled ? "active" : "inactive"}`}
                              onClick={() => handleToggleContest(c)}
                              disabled={togglingContestId === (c._id || c.contestId)}
                              title={c.enabled ? "Click to exclude from team Elo" : "Click to include in team Elo"}
                            >
                              {togglingContestId === (c._id || c.contestId)
                                ? "Updating…"
                                : c.enabled
                                ? "✓ Enabled (Counted)"
                                : "✕ Disabled (Excluded)"}
                            </button>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="danger xs"
                              onClick={() => handleDeleteContest(c._id, c.title || c.contestId)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3: REQUESTS & PASSKEYS (CLEAN FILTERED UI)
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "requests" && (
          <div style={{ display: "grid", gap: 20 }}>
            {/* Top Settings Row: Passkey & Admin Password */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
              {/* Passkey Security Setting */}
              <div className="adm-card">
                <div className="adm-card-header">
                  <div>
                    <h3>Submission Passkey</h3>
                    <p>Secret passkey students provide to join or reactivate</p>
                  </div>
                </div>
                <form onSubmit={handleUpdatePasskey} style={{ display: "flex", gap: 10 }}>
                  <input
                    type="password"
                    placeholder="Enter new passkey..."
                    value={newPasskey}
                    onChange={(e) => setNewPasskey(e.target.value)}
                    className="adm-input"
                    required
                  />
                  <button type="submit" className="primary sm">
                    Update Passkey
                  </button>
                </form>
                {passkeyMsg && <div style={{ fontSize: 12, color: "#10b981", marginTop: 8 }}>{passkeyMsg}</div>}
              </div>

              {/* Admin Password Setting Card */}
              <div className="adm-card">
                <div className="adm-card-header">
                  <div>
                    <h3>Admin Password</h3>
                    <p>Update administrator login password for this console</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    Manage admin console security and credentials.
                  </span>
                  <button
                    type="button"
                    className="primary sm"
                    onClick={() => {
                      setCredError("");
                      setCredSuccess("");
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmNewPassword("");
                      setCredModal(true);
                    }}
                  >
                    🔒 Change Password
                  </button>
                </div>
              </div>
            </div>


            {/* Requests Management Card with Filters */}
            <div className="adm-card">
              <div className="adm-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2>Student Requests ({requests.length} Total)</h2>
                  <p>Review student submissions before publishing them to the live standings</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="secondary sm" onClick={loadRequests}>
                    ↻ Reload
                  </button>
                </div>
              </div>

              {/* Status Filter Pills */}
              <div style={{ padding: "0 0 16px 0", borderBottom: "1px solid var(--border-subtle)", marginBottom: 16 }}>
                <div className="adm-pill-group">
                  <button
                    className={`adm-pill-btn ${requestFilter === "pending" ? "active" : ""}`}
                    onClick={() => setRequestFilter("pending")}
                  >
                    ⏳ Pending ({pendingRequests.length})
                  </button>
                  <button
                    className={`adm-pill-btn ${requestFilter === "approved" ? "active" : ""}`}
                    onClick={() => setRequestFilter("approved")}
                  >
                    ✓ Approved ({approvedRequests.length})
                  </button>
                  <button
                    className={`adm-pill-btn ${requestFilter === "rejected" ? "active" : ""}`}
                    onClick={() => setRequestFilter("rejected")}
                  >
                    ✕ Rejected ({rejectedRequests.length})
                  </button>
                  <button
                    className={`adm-pill-btn ${requestFilter === "all" ? "active" : ""}`}
                    onClick={() => setRequestFilter("all")}
                  >
                    All Records ({requests.length})
                  </button>
                </div>
              </div>

              {requestsLoading ? (
                <div className="adm-loading">Loading requests…</div>
              ) : displayedRequests.length === 0 ? (
                <div className="adm-empty">
                  {requestFilter === "pending"
                    ? "✨ No pending requests right now. All submissions are processed!"
                    : `No ${requestFilter} requests found.`}
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Name / Team</th>
                        <th>Handle</th>
                        <th>Roll &amp; Batch</th>
                        <th>Date Submitted</th>
                        <th style={{ textAlign: "right" }}>Status / Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRequests.map((r) => {
                        const isPending = !r.status || r.status === "pending";
                        const isApproved = r.status === "approved";
                        const isRejected = r.status === "rejected";
                        return (
                          <tr key={r._id}>
                            <td>
                              <span
                                className="std-batch-pill"
                                style={{
                                  background: r.type === "reactivation" ? "rgba(245, 158, 11, 0.15)" : "var(--primary-glow)",
                                  color: r.type === "reactivation" ? "var(--warning)" : "var(--primary)",
                                  fontWeight: 700,
                                }}
                              >
                                {r.type || "join"}
                              </span>
                            </td>
                            <td>
                              <strong>{r.name || r.teamName || "—"}</strong>
                            </td>
                            <td>
                              {r.handle && (
                                <a
                                  href={`https://codeforces.com/profile/${r.handle}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="std-cf-link"
                                >
                                  {r.handle} ↗
                                </a>
                              )}
                              {r.teamVjudgeHandle && <span>{r.teamVjudgeHandle}</span>}
                            </td>
                            <td>
                              <span className="std-roll-pill">{r.roll || "—"}</span>{" "}
                              <span className="std-batch-text">{r.batch || ""}</span>
                            </td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {new Date(r.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {isPending ? (
                                <div style={{ display: "inline-flex", gap: 6 }}>
                                  <button
                                    className="success xs"
                                    onClick={() => handleApproveReq(r._id)}
                                  >
                                    Approve ✓
                                  </button>
                                  <button
                                    className="danger xs"
                                    onClick={() => handleRejectReq(r._id)}
                                  >
                                    Reject ✕
                                  </button>
                                </div>
                              ) : isApproved ? (
                                <span className="adm-status-pill active">✓ Approved</span>
                              ) : isRejected ? (
                                <span className="adm-status-pill inactive">✕ Rejected</span>
                              ) : (
                                <span className="std-batch-pill">{r.status}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ══════════════════════════════════════════════════════════════════
            TAB 4: 🎯 CONTEST SETTER HUB (EXACT CONTESTSETTER UI)
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "contestSetter" && <ContestSetterAdmin />}
      </main>

      {/* ── MODAL: ADD / EDIT PARTICIPANT ── */}
      {addHandleModal && (
        <div className="std-modal-overlay" onClick={() => setAddHandleModal(false)}>
          <div className="std-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="std-modal-header">
              <h2>{editingHandle ? "Edit Participant" : "Add Participant"}</h2>
              <button className="std-modal-close" onClick={() => setAddHandleModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveHandle} className="std-modal-body">
              {hError && <div className="notice error">{hError}</div>}
              <div className="std-field">
                <label>Codeforces Handle *</label>
                <input
                  type="text"
                  value={hHandle}
                  onChange={(e) => setHHandle(e.target.value)}
                  disabled={Boolean(editingHandle)}
                  required
                />
              </div>
              <div className="std-field">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={hName}
                  onChange={(e) => setHName(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="std-field">
                  <label>Roll Number *</label>
                  <input
                    type="text"
                    value={hRoll}
                    onChange={(e) => setHRoll(e.target.value)}
                    required
                  />
                </div>
                <div className="std-field">
                  <label>Batch (2K**) *</label>
                  <input
                    type="text"
                    value={hBatch}
                    onChange={(e) => setHBatch(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="hInactiveCheck"
                  checked={hInactive}
                  onChange={(e) => setHInactive(e.target.checked)}
                />
                <label htmlFor="hInactiveCheck" style={{ fontSize: 13, cursor: "pointer" }}>
                  Mark as Inactive Handle
                </label>
              </div>

              <div className="std-modal-footer">
                <button type="button" className="secondary sm" onClick={() => setAddHandleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary sm" disabled={hLoading}>
                  {hLoading ? "Saving…" : "Save Participant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT TEAM ── */}
      {addTeamModal && (
        <div className="std-modal-overlay" onClick={() => setAddTeamModal(false)}>
          <div className="std-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="std-modal-header">
              <h2>{editingTeam ? "Edit Team" : "Add VJudge Team"}</h2>
              <button className="std-modal-close" onClick={() => setAddTeamModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveTeam} className="std-modal-body">
              {tError && <div className="notice error">{tError}</div>}
              <div className="std-field">
                <label>Team Name *</label>
                <input
                  type="text"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  required
                />
              </div>
              <div className="std-field">
                <label>Team VJudge Handle *</label>
                <input
                  type="text"
                  value={tVjHandle}
                  onChange={(e) => setTVjHandle(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: "block" }}>
                  Team Members (3 Members)
                </label>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      placeholder={`Member ${idx + 1} Name`}
                      value={tMembers[idx].name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, name: val } : m)));
                      }}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Roll"
                      value={tMembers[idx].roll}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, roll: val } : m)));
                      }}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Batch"
                      value={tMembers[idx].batch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, batch: val } : m)));
                      }}
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="std-modal-footer">
                <button type="button" className="secondary sm" onClick={() => setAddTeamModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary sm" disabled={tLoading}>
                  {tLoading ? "Saving…" : "Save Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD CONTEST ── */}
      {addContestModal && (
        <div className="std-modal-overlay" onClick={() => setAddContestModal(false)}>
          <div className="std-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="std-modal-header">
              <h2>Add VJudge Contest</h2>
              <button className="std-modal-close" onClick={() => setAddContestModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveContest} className="std-modal-body">
              {cError && <div className="notice error">{cError}</div>}
              <div className="std-field">
                <label>VJudge Contest ID *</label>
                <input
                  type="number"
                  placeholder="e.g. 612345"
                  value={cId}
                  onChange={(e) => setCId(e.target.value)}
                  required
                />
              </div>
              <div className="std-field">
                <label>Contest Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. KUET Team Practice Contest #1"
                  value={cTitle}
                  onChange={(e) => setCTitle(e.target.value)}
                />
              </div>

              <div className="std-modal-footer">
                <button type="button" className="secondary sm" onClick={() => setAddContestModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary sm" disabled={cLoading}>
                  {cLoading ? "Adding…" : "Add Contest"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CHANGE ADMIN PASSWORD ── */}
      {credModal && (

        <div className="std-modal-overlay" onClick={() => setCredModal(false)}>
          <div className="std-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="std-modal-header">
              <h2>Change Admin Password</h2>
              <button className="std-modal-close" onClick={() => setCredModal(false)}>✕</button>
            </div>
            <form onSubmit={handleChangeAdminPassword} className="std-modal-body">
              {credError && <div className="notice error">{credError}</div>}
              {credSuccess && <div className="notice success">{credSuccess}</div>}

              <div className="std-field">
                <label>Current Password *</label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="std-field">
                <label>New Password *</label>
                <input
                  type="password"
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="std-field">
                <label>Confirm New Password *</label>
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="std-modal-footer">
                <button type="button" className="secondary sm" onClick={() => setCredModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary sm" disabled={credLoading}>
                  {credLoading ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

