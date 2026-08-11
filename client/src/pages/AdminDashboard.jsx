import React, { useEffect, useState, useMemo } from "react";
import {
  createHandle,
  deleteHandle,
  forceRefreshHandle,
  getHandles,
  updateHandle,
  createVjudgeContest,
  createVjudgeTeam,
  deleteVjudgeContest,
  deleteVjudgeTeam,
  getVjudgeConfig,
  getVjudgeContests,
  getVjudgeTeams,
  updateVjudgeTeam,
  updateVjudgeConfig,
  updateVjudgeContest,
  updateAdminCredentials,
  getRequests,
  approveRequest,
  rejectRequest,
  updatePasskey,
} from "../api.js";

// ─── Session Tab Persistence ──────────────────────────────────────────────────
const ADMIN_TAB_KEY = "sgipc_admin_tab";
const getInitialAdminTab = () => {
  try { return sessionStorage.getItem(ADMIN_TAB_KEY) || "individual"; } catch { return "individual"; }
};
const saveAdminTab = (tab) => {
  try { sessionStorage.setItem(ADMIN_TAB_KEY, tab); } catch {}
};

// ─── Batch Utilities ──────────────────────────────────────────────────────────
const extractBatchDigits = (b) => { const m = (b || "").match(/(\d{2})$/); return m ? m[1] : null; };
const normalizeBatch     = (b) => { const d = extractBatchDigits(b); return d ? `2K${d}` : null; };

const emptyMember = () => ({ name: "", roll: "", batch: "" });

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState(getInitialAdminTab);
  const switchTab = (tab) => { setActiveTab(tab); saveAdminTab(tab); };

  // Data states
  const [handles, setHandles] = useState([]);
  const [vjudgeTeams, setVjudgeTeams] = useState([]);
  const [vjudgeContests, setVjudgeContests] = useState([]);
  const [vjudgeConfig, setVjudgeConfig] = useState({ eloMode: "normal" });
  const [requests, setRequests] = useState([]);
  const [requestsCount, setRequestsCount] = useState(0);

  // Load states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");

  // Filters & search
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [batchFilterOpen, setBatchFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [addHandleModalOpen, setAddHandleModalOpen] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoll, setNewRoll] = useState("");
  const [newBatch, setNewBatch] = useState("");
  const [isAddingHandle, setIsAddingHandle] = useState(false);
  const [addHandleError, setAddHandleError] = useState("");

  const [addTeamModalOpen, setAddTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamVjudgeHandle, setTeamVjudgeHandle] = useState("");
  const [teamMembers, setTeamMembers] = useState([emptyMember(), emptyMember(), emptyMember()]);
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [addTeamError, setAddTeamError] = useState("");

  const [addContestModalOpen, setAddContestModalOpen] = useState(false);
  const [contestIdInput, setContestIdInput] = useState("");
  const [contestTitleInput, setContestTitleInput] = useState("");
  const [isAddingContest, setIsAddingContest] = useState(false);

  const [handleDetailModal, setHandleDetailModal] = useState(null); // handle object | null
  const [teamDetailModal, setTeamDetailModal] = useState(null); // team object | null
  const [requestDetailModal, setRequestDetailModal] = useState(null); // request object | null

  // Editing states
  const [editingHandleId, setEditingHandleId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingRoll, setEditingRoll] = useState("");
  const [editingBatch, setEditingBatch] = useState("");

  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamAliases, setEditingTeamAliases] = useState("");

  const [editingContestId, setEditingContestId] = useState(null);
  const [editingContestValue, setEditingContestValue] = useState("");
  const [editingContestTitle, setEditingContestTitle] = useState("");
  const [editingContestEnabled, setEditingContestEnabled] = useState(true);

  // Request actions
  const [approvingRequestId, setApprovingRequestId] = useState(null);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [requestSuccessId, setRequestSuccessId] = useState(null);

  // Admin settings modals
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialTab, setCredentialTab] = useState("username");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credMessage, setCredMessage] = useState("");
  const [credError, setCredError] = useState("");

  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyValue, setPasskeyValue] = useState("");
  const [passkeyConfirm, setPasskeyConfirm] = useState("");
  const [passkeyMessage, setPasskeyMessage] = useState("");

  const handleAuthError = (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("sgipc_token");
      window.location.href = "/admin";
      return true;
    }
    return false;
  };

  // ── Ranks Pre-computation ──────────────────────────────────────────────────
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

  const sortedHandles = useMemo(() => {
    if (!sortField) return handles;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...handles].sort((a, b) => {
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
      if ((b.standingRating || 0) !== (a.standingRating || 0)) return (b.standingRating || 0) - (a.standingRating || 0);
      return (b.maxRating || 0) - (a.maxRating || 0);
    });
  }, [handles, sortField, sortDir]);

  const globalRankMap = useMemo(() => {
    const m = new Map();
    sortedHandles.forEach((h, i) => m.set(String(h._id || h.id), i + 1));
    return m;
  }, [sortedHandles]);

  const practiceRankMap = useMemo(() => {
    const m = new Map();
    const sorted = [...handles].sort((a, b) => {
      if ((b.standingRating || 0) !== (a.standingRating || 0)) {
        return (b.standingRating || 0) - (a.standingRating || 0);
      }
      if ((b.maxRating || 0) !== (a.maxRating || 0)) {
        return (b.maxRating || 0) - (a.maxRating || 0);
      }
      return (a.roll || "").localeCompare(b.roll || "", undefined, { numeric: true, sensitivity: "base" });
    });
    sorted.forEach((h, i) => m.set(String(h._id || h.id), i + 1));
    return m;
  }, [handles]);

  const cfMaxRankMap = useMemo(() => {
    const m = new Map();
    const sorted = [...handles].sort((a, b) => {
      if ((b.maxRating || 0) !== (a.maxRating || 0)) {
        return (b.maxRating || 0) - (a.maxRating || 0);
      }
      return (a.roll || "").localeCompare(b.roll || "", undefined, { numeric: true, sensitivity: "base" });
    });
    sorted.forEach((h, i) => m.set(String(h._id || h.id), i + 1));
    return m;
  }, [handles]);

  // ── Filters & Search ───────────────────────────────────────────────────────
  const availableBatches = useMemo(() => {
    const s = new Set();
    handles.forEach((r) => { const n = normalizeBatch(r.batch); if (n) s.add(n); });
    return Array.from(s).sort();
  }, [handles]);

  const filteredHandles = useMemo(() => {
    let list = sortedHandles;
    if (selectedBatches.length > 0) {
      list = list.filter((r) => {
        const d = extractBatchDigits(r.batch);
        return d && selectedBatches.some((b) => extractBatchDigits(b) === d);
      });
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.handle || "").toLowerCase().includes(q) ||
        (r.name   || "").toLowerCase().includes(q) ||
        (r.roll   || "").toLowerCase().includes(q)
    );
  }, [sortedHandles, selectedBatches, searchQuery]);

  const toggleBatch = (b) =>
    setSelectedBatches((p) => (p.includes(b) ? p.filter((x) => x !== b) : [...p, b]));

  // ── Data Loaders ───────────────────────────────────────────────────────────
  const loadHandles = async () => {
    try {
      setLoading(true);
      const data = await getHandles();
      setHandles(data);
      setError("");
    } catch (err) {
      if (!handleAuthError(err)) setError("Failed to load handles.");
    } finally {
      setLoading(false);
    }
  };

  const loadVjudge = async () => {
    try {
      const [teamsData, contestsData, configData] = await Promise.all([
        getVjudgeTeams(),
        getVjudgeContests(),
        getVjudgeConfig(),
      ]);
      setVjudgeTeams(teamsData);
      setVjudgeContests(contestsData);
      setVjudgeConfig(configData);
    } catch (err) {
      handleAuthError(err);
    }
  };

  const loadRequests = async () => {
    try {
      setRequestsLoading(true);
      const data = await getRequests("pending");
      setRequests(data);
      setRequestsCount(data.length);
      setRequestsError("");
    } catch (err) {
      if (!handleAuthError(err)) setRequestsError("Failed to load requests.");
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadHandles();
    loadVjudge();
    loadRequests();
  }, []);

  // ── Create Handle ──────────────────────────────────────────────────────────
  const handleCreateHandle = async () => {
    setAddHandleError("");
    if (!newHandle.trim()) return setAddHandleError("Codeforces handle is required.");
    setIsAddingHandle(true);
    try {
      await createHandle({
        handle: newHandle.trim(),
        name: newName.trim(),
        roll: newRoll.trim(),
        batch: newBatch.trim(),
      });
      setNewHandle(""); setNewName(""); setNewRoll(""); setNewBatch("");
      setAddHandleModalOpen(false);
      await loadHandles();
    } catch (err) {
      setAddHandleError(err?.response?.data?.message || "Failed to add handle.");
    } finally {
      setIsAddingHandle(false);
    }
  };

  // ── Create Team ────────────────────────────────────────────────────────────
  const updateTeamMember = (idx, field, val) =>
    setTeamMembers((p) => p.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));

  const handleCreateTeam = async () => {
    setAddTeamError("");
    if (!teamName.trim()) return setAddTeamError("Team name is required.");
    if (!teamVjudgeHandle.trim()) return setAddTeamError("Team VJudge handle is required.");
    for (let i = 0; i < 3; i++) {
      const m = teamMembers[i];
      if (!m.name.trim() || !m.roll.trim() || !m.batch.trim())
        return setAddTeamError(`All fields (Name, Roll, Batch) for Member ${i + 1} are required.`);
    }

    setIsAddingTeam(true);
    try {
      await createVjudgeTeam({ name: teamName.trim(), aliases: [teamVjudgeHandle.trim()], members: teamMembers });
      setTeamName(""); setTeamVjudgeHandle(""); setTeamMembers([emptyMember(), emptyMember(), emptyMember()]);
      setAddTeamModalOpen(false);
      await loadVjudge();
    } catch (err) {
      setAddTeamError(err?.response?.data?.message || "Failed to add team.");
    } finally {
      setIsAddingTeam(false);
    }
  };

  // ── Create Contest ─────────────────────────────────────────────────────────
  const handleCreateContest = async () => {
    if (!contestIdInput.trim()) return;
    setIsAddingContest(true);
    try {
      await createVjudgeContest({ contestId: contestIdInput.trim(), title: contestTitleInput.trim() });
      setContestIdInput(""); setContestTitleInput("");
      setAddContestModalOpen(false);
      await loadVjudge();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to add contest.");
    } finally {
      setIsAddingContest(false);
    }
  };

  // ── Handle Inline Edit ─────────────────────────────────────────────────────
  const startEditingHandle = (row) => {
    setEditingHandleId(row._id);
    setEditingName(row.name || "");
    setEditingRoll(row.roll || "");
    setEditingBatch(row.batch || "");
  };

  const saveEditingHandle = async (id) => {
    try {
      await updateHandle(id, { name: editingName.trim(), roll: editingRoll.trim(), batch: editingBatch.trim() });
      setEditingHandleId(null);
      await loadHandles();
    } catch (err) { alert(err?.response?.data?.message || "Failed to update handle."); }
  };

  const handleDeleteHandle = async (id) => {
    if (!window.confirm("Are you sure you want to delete this handle?")) return;
    try {
      await deleteHandle(id);
      await loadHandles();
    } catch (err) { alert(err?.response?.data?.message || "Failed to delete handle."); }
  };

  const [refreshingHandleId, setRefreshingHandleId] = useState(null);
  const handleForceRefresh = async (id, handle) => {
    if (refreshingHandleId) return;
    if (!window.confirm(`Force-refresh data for "${handle}"? This will re-activate them if inactive and pull the latest data from Codeforces.`)) return;
    try {
      setRefreshingHandleId(id);
      const result = await forceRefreshHandle(id);
      alert(result?.message || `${handle} refreshed successfully.`);
      await loadHandles();
    } catch (err) {
      alert(err?.response?.data?.message || "Force refresh failed.");
    } finally {
      setRefreshingHandleId(null);
    }
  };

  const handleDeleteTeam = async (id) => {
    if (!window.confirm("Are you sure you want to delete this team?")) return;
    try {
      await deleteVjudgeTeam(id);
      await loadVjudge();
    } catch (err) { alert(err?.response?.data?.message || "Failed to delete team."); }
  };

  const handleDeleteContest = async (id) => {
    if (!window.confirm("Are you sure you want to delete this contest?")) return;
    try {
      await deleteVjudgeContest(id);
      await loadVjudge();
    } catch (err) { alert(err?.response?.data?.message || "Failed to delete contest."); }
  };

  // ── Request Approval ───────────────────────────────────────────────────────
  const handleApproveRequest = async (id) => {
    if (approvingRequestId || rejectingRequestId) return;
    try {
      setApprovingRequestId(id);
      setRequestSuccessId(null);
      await approveRequest(id);
      await loadRequests();
      await loadHandles();
      await loadVjudge();
      setRequestSuccessId(id);
      setTimeout(() => setRequestSuccessId(null), 1200);
    } catch (err) {
      setRequestsError(err?.response?.data?.message || "Unable to approve request");
    } finally {
      setApprovingRequestId(null);
    }
  };

  const handleRejectRequest = async (id) => {
    if (approvingRequestId || rejectingRequestId) return;
    try {
      setRejectingRequestId(id);
      setRequestSuccessId(null);
      await rejectRequest(id);
      await loadRequests();
      setRequestSuccessId(id);
      setTimeout(() => setRequestSuccessId(null), 1200);
    } catch (err) {
      setRequestsError(err?.response?.data?.message || "Unable to reject request");
    } finally {
      setRejectingRequestId(null);
    }
  };

  // ── Passkey & Admin Profile ────────────────────────────────────────────────
  const handleUpdatePasskey = async () => {
    setPasskeyMessage("");
    if (!passkeyValue.trim() || !passkeyConfirm.trim()) return setPasskeyMessage("Passkey fields required.");
    if (passkeyValue.trim() !== passkeyConfirm.trim()) return setPasskeyMessage("Passkeys do not match.");
    try {
      await updatePasskey({ newPasskey: passkeyValue.trim() });
      setPasskeyMessage("Passkey updated successfully.");
      setPasskeyValue(""); setPasskeyConfirm("");
      setTimeout(() => setShowPasskeyModal(false), 1200);
    } catch (err) { setPasskeyMessage(err?.response?.data?.message || "Failed to update passkey."); }
  };

  const handleUpdateCredentials = async () => {
    setCredMessage(""); setCredError("");
    if (!currentPassword) return setCredError("Current password is required.");
    if (credentialTab === "username" && !newUsername.trim()) return setCredError("New username is required.");
    if (credentialTab === "password") {
      if (!newPassword) return setCredError("New password is required.");
      if (!confirmPassword) return setCredError("Confirm password is required.");
      if (newPassword !== confirmPassword) return setCredError("New password and confirm password do not match.");
    }
    try {
      await updateAdminCredentials({
        currentPassword,
        newUsername: credentialTab === "username" ? newUsername.trim() : undefined,
        newPassword: credentialTab === "password" ? newPassword : undefined,
      });
      setCredMessage("Credentials updated successfully!");
      setCurrentPassword(""); setNewUsername(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => setShowCredentialsModal(false), 1200);
    } catch (err) { setCredError(err?.response?.data?.message || "Failed to update credentials."); }
  };

  const logout = () => {
    localStorage.removeItem("sgipc_token");
    window.location.href = "/admin";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="container">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-inner">
          <div>
            <span className="badge">Admin Panel</span>
            <h1>SGIPC <span className="accent">Management</span></h1>
            <p>Manage standings, handles, teams, and request approvals</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary sm" onClick={() => { setShowCredentialsModal(true); setCredMessage(""); setCredError(""); }}>
              🔑 Account Credentials
            </button>
            <button className="secondary sm" onClick={() => { setShowPasskeyModal(true); setPasskeyMessage(""); }}>
              🔒 Update Passkey
            </button>
            <button className="danger sm" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ── TABS (PERSISTENT VIA SESSIONSTORAGE) ───────────────────────────── */}
      <div className="tabs">
        <button className={`tab ${activeTab === "individual" ? "active" : ""}`} onClick={() => switchTab("individual")}>
          🏆 Individual Handles
        </button>
        <button className={`tab ${activeTab === "team" ? "active" : ""}`} onClick={() => switchTab("team")}>
          👥 Teams &amp; Contests
        </button>
        <button className={`tab ${activeTab === "requests" ? "active" : ""}`} onClick={() => switchTab("requests")}>
          📥 Requests
          {requestsCount > 0 && (
            <span style={{ marginLeft: 6, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
              {requestsCount}
            </span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          INDIVIDUAL HANDLES TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "individual" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Codeforces Participants ({filteredHandles.length})</h2>
              <p className="card-subtitle">Active individual standings participants</p>
            </div>
            <button className="primary sm" onClick={() => { setAddHandleError(""); setAddHandleModalOpen(true); }}>
              ＋ Add Participant
            </button>
          </div>

          {/* Filter Bar */}
          {!loading && handles.length > 0 && (
            <div className="filter-bar">
              <div className="filter-section">
                <button className="secondary sm" onClick={() => setBatchFilterOpen(!batchFilterOpen)}>
                  🎓 Batch{selectedBatches.length > 0 && (
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
                    placeholder="Search handle, name or roll..."
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
                  <input type="checkbox" checked={selectedBatches.includes(b)} onChange={() => toggleBatch(b)} style={{ width: "auto", accentColor: "var(--primary)" }} />
                  {b}
                </label>
              ))}
            </div>
          )}

          {loading && <div className="empty-state"><div className="loading-spinner" /><p>Loading handles...</p></div>}
          {!loading && error && <div className="notice error">{error}</div>}
          {!loading && !error && filteredHandles.length === 0 && (
            <div className="empty-state"><p>No handles found.</p></div>
          )}

          {!loading && filteredHandles.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("handle")}>
                    Handle / Name {sortField === "handle" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th>Roll</th>
                  <th>Batch</th>
                  <th style={{ width: 90, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("maxRating")}>
                    CF Max {sortField === "maxRating" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={{ width: 80, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("solvedCount")}>
                    Solved {sortField === "solvedCount" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={{ width: 110, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("standingRating")}>
                    Practice {sortField === "standingRating" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHandles.map((row, idx) => {
                  const isEditing = editingHandleId === row._id;
                  const currentRank = globalRankMap.get(String(row._id || row.id)) ?? (idx + 1);
                  return (
                    <tr key={row._id}>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 13 }}>
                        {currentRank}
                      </td>
                      <td>
                        <a href={`https://codeforces.com/profile/${row.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">
                          {row.handle}
                        </a>
                        {isEditing ? (
                          <div style={{ marginTop: 4 }}>
                            <input
                              type="text"
                              placeholder="Full Name"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              style={{ padding: "3px 6px", fontSize: 12 }}
                            />
                          </div>
                        ) : (
                          row.name && <div className="handle-sub">{row.name}</div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingRoll} onChange={(e) => setEditingRoll(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <span className="text-mono">{row.roll || "—"}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingBatch} onChange={(e) => setEditingBatch(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <span className="text-mono">{normalizeBatch(row.batch) || row.batch || "—"}</span>
                        )}
                      </td>
                      <td><span className="stat-badge rating">{row.maxRating || "—"}</span></td>
                      <td><span className="stat-badge solved">{row.solvedCount || 0}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>{row.standingRating || 1000}</td>
                      <td style={{ textAlign: "center" }}>
                        <button className="icon-btn" onClick={() => setHandleDetailModal(row)} title="View details">👁</button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button className="primary xs" onClick={() => saveEditingHandle(row._id)}>Save</button>
                              <button className="secondary xs" onClick={() => setEditingHandleId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="secondary xs" onClick={() => startEditingHandle(row)}>Edit</button>
                              <button
                                className="secondary xs"
                                onClick={() => handleForceRefresh(row._id, row.handle)}
                                disabled={!!refreshingHandleId}
                                title="Force re-fetch from Codeforces and re-activate if inactive"
                                style={refreshingHandleId === row._id ? { opacity: 0.6 } : {}}
                              >
                                {refreshingHandleId === row._id ? "⏳" : "🔄"}
                              </button>
                              <button className="danger xs" onClick={() => handleDeleteHandle(row._id)}>Delete</button>
                            </>
                          )}
                        </div>
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
          TEAM STANDINGS TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "team" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>VJudge Teams ({vjudgeTeams.length})</h2>
              <p className="card-subtitle">Manage teams for team contest standings</p>
            </div>
            <button className="primary sm" onClick={() => { setAddTeamError(""); setAddTeamModalOpen(true); }}>
              ＋ Add Team
            </button>
          </div>

          {/* Teams Table */}
          {vjudgeTeams.length === 0 ? (
            <div className="empty-state"><p>No teams registered yet.</p></div>
          ) : (
            <table className="table" style={{ marginBottom: 32 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Team Name</th>
                  <th>VJudge Handle</th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vjudgeTeams.map((team, idx) => {
                  const isEditing = editingTeamId === team._id;
                  return (
                    <tr key={team._id}>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{idx + 1}</td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingTeamName} onChange={(e) => setEditingTeamName(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <strong style={{ color: "var(--text-primary)" }}>{team.name}</strong>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingTeamAliases} onChange={(e) => setEditingTeamAliases(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <span className="text-mono" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            {team.aliases?.join(", ") || "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button className="icon-btn" onClick={() => setTeamDetailModal(team)} title="View team details">
                          👁
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button className="primary xs" onClick={async () => {
                                const aliases = editingTeamAliases.split(",").map((x) => x.trim()).filter(Boolean);
                                await updateVjudgeTeam(team._id, { name: editingTeamName.trim(), aliases });
                                setEditingTeamId(null);
                                await loadVjudge();
                              }}>Save</button>
                              <button className="secondary xs" onClick={() => setEditingTeamId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="secondary xs" onClick={() => {
                                setEditingTeamId(team._id);
                                setEditingTeamName(team.name);
                                setEditingTeamAliases(team.aliases?.join(", ") || "");
                              }}>Edit</button>
                              <button className="danger xs" onClick={() => handleDeleteTeam(team._id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="section-divider" />

          {/* Contests Section */}
          <div className="card-header" style={{ marginTop: 24 }}>
            <div>
              <h2>VJudge Contests ({vjudgeContests.length})</h2>
              <p className="card-subtitle">Contests included in team Elo rating calculation</p>
            </div>
            <button className="secondary sm" onClick={() => setAddContestModalOpen(true)}>
              ＋ Add Contest
            </button>
          </div>

          {vjudgeContests.length === 0 ? (
            <div className="empty-state"><p>No contests added yet.</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Contest ID</th>
                  <th>Title</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vjudgeContests.map((c) => {
                  const isEditing = editingContestId === c._id;
                  const isEnabled = c.enabled !== false;
                  return (
                    <tr key={c._id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        {isEditing ? (
                          <input type="text" value={editingContestValue} onChange={(e) => setEditingContestValue(e.target.value)} style={{ padding: "3px 6px", width: 90 }} />
                        ) : (
                          c.contestId
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingContestTitle} onChange={(e) => setEditingContestTitle(e.target.value)} style={{ padding: "3px 6px", width: "100%" }} />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{c.title || "Untitled Contest"}</span>
                            <button
                              className="icon-btn"
                              title="Edit contest"
                              style={{ padding: "2px 4px", fontSize: 13 }}
                              onClick={() => {
                                setEditingContestId(c._id);
                                setEditingContestValue(String(c.contestId || ""));
                                setEditingContestTitle(c.title || "");
                              }}
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className={isEnabled ? "success xs" : "secondary xs"}
                          style={{
                            padding: "3px 10px",
                            borderRadius: "999px",
                            fontWeight: 600,
                            fontSize: 11,
                            background: isEnabled ? "var(--success-light)" : "var(--bg-subtle)",
                            color: isEnabled ? "var(--success)" : "var(--text-muted)",
                            border: `1px solid ${isEnabled ? "var(--success)" : "var(--border)"}`,
                            cursor: "pointer"
                          }}
                          onClick={async () => {
                            const actionText = isEnabled ? "disable" : "enable";
                            if (window.confirm(`Are you sure you want to ${actionText} this contest?`)) {
                              try {
                                await updateVjudgeContest(c._id, { enabled: !isEnabled });
                                await loadVjudge();
                              } catch (err) {
                                alert(err?.response?.data?.message || "Failed to update contest status.");
                              }
                            }
                          }}
                        >
                          {isEnabled ? "● Enabled" : "○ Disabled"}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button className="primary xs" onClick={async () => {
                                try {
                                  await updateVjudgeContest(c._id, { contestId: editingContestValue.trim(), title: editingContestTitle.trim() });
                                  setEditingContestId(null);
                                  await loadVjudge();
                                } catch (err) {
                                  alert(err?.response?.data?.message || "Failed to update contest.");
                                }
                              }}>Save</button>
                              <button className="secondary xs" onClick={() => setEditingContestId(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="danger xs" onClick={() => handleDeleteContest(c._id)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Contest Mode Config */}
          <div style={{ marginTop: 24, padding: 16, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <div className="field" style={{ maxWidth: 300 }}>
              <label>Team Elo Rating Mode</label>
              <select
                value={vjudgeConfig.eloMode || "normal"}
                onChange={async (e) => {
                  const mode = e.target.value;
                  setVjudgeConfig((p) => ({ ...p, eloMode: mode }));
                  await updateVjudgeConfig({ eloMode: mode });
                }}
              >
                <option value="normal">Classic Elo (standard wins/losses)</option>
                <option value="gain-only">Gain-Only Elo (no loss penalization)</option>
                <option value="zero-participation">Participation Required (unattended = loss)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          REQUESTS TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "requests" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Pending Requests ({requests.length})</h2>
              <p className="card-subtitle">User requests for handles, team registrations &amp; reactivations</p>
            </div>
            <button className="secondary sm" onClick={loadRequests}>↻ Refresh</button>
          </div>

          {requestsLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading requests...</p></div>}
          {!requestsLoading && requestsError && <div className="notice error">{requestsError}</div>}
          {!requestsLoading && !requestsError && requests.length === 0 && (
            <div className="empty-state"><p>🎉 No pending requests right now.</p></div>
          )}

          {!requestsLoading && !requestsError && requests.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Type</th>
                  <th>Details</th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 180, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((reqItem) => (
                  <tr key={reqItem._id}>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "capitalize",
                        background: reqItem.type === "reactivation" ? "var(--info-light)" : reqItem.type === "handle" ? "var(--success-light)" : "var(--warning-light)",
                        color: reqItem.type === "reactivation" ? "var(--info)" : reqItem.type === "handle" ? "var(--success)" : "var(--warning)",
                        border: `1px solid ${reqItem.type === "reactivation" ? "var(--info-border)" : reqItem.type === "handle" ? "var(--success-border)" : "var(--warning-border)"}`,
                      }}>
                        {reqItem.type}
                      </span>
                    </td>
                    <td>
                      {reqItem.type === "handle" && (
                        <div>
                          <span className="handle-name" style={{ textDecoration: "none", cursor: "default" }}>{reqItem.handle}</span>
                          <div className="handle-sub">
                            {reqItem.name && <span>{reqItem.name}</span>}
                            {reqItem.name && reqItem.batch && " · "}
                            {reqItem.batch && <span className="text-mono">{normalizeBatch(reqItem.batch) || reqItem.batch}</span>}
                          </div>
                        </div>
                      )}
                      {reqItem.type === "reactivation" && (
                        <div>
                          <span className="handle-name" style={{ textDecoration: "none", cursor: "default" }}>{reqItem.handle}</span>
                          <div className="handle-sub">
                            {reqItem.name && <span>{reqItem.name}</span>}
                            {reqItem.name && reqItem.batch && " · "}
                            {reqItem.batch && <span className="text-mono">{normalizeBatch(reqItem.batch) || reqItem.batch}</span>}
                          </div>
                        </div>
                      )}
                      {reqItem.type === "team" && (
                        <div>
                          <strong style={{ color: "var(--text-primary)" }}>{reqItem.teamName}</strong>
                          <div className="handle-sub">{reqItem.teamHandles}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button className="icon-btn" onClick={() => setRequestDetailModal(reqItem)} title="View details">👁</button>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          className="success sm"
                          onClick={() => handleApproveRequest(reqItem._id)}
                          disabled={approvingRequestId === reqItem._id || rejectingRequestId === reqItem._id}
                        >
                          {approvingRequestId === reqItem._id ? "Approving…" : "Approve"}
                        </button>
                        <button
                          className="danger sm"
                          onClick={() => handleRejectRequest(reqItem._id)}
                          disabled={approvingRequestId === reqItem._id || rejectingRequestId === reqItem._id}
                        >
                          {rejectingRequestId === reqItem._id ? "Rejecting…" : "Reject"}
                        </button>
                        {requestSuccessId === reqItem._id && <span style={{ color: "var(--success)", fontWeight: 600, fontSize: 12 }}>✓ Done</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD PARTICIPANT HANDLE
          ════════════════════════════════════════════════════════════════════ */}
      {addHandleModalOpen && (
        <div className="modal-overlay" onClick={() => setAddHandleModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Participant Handle</h2>
              <button className="modal-close" onClick={() => setAddHandleModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {addHandleError && <div className="notice error" style={{ marginBottom: 12 }}>{addHandleError}</div>}
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>Codeforces Handle *</label>
                  <input type="text" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="e.g. tourist" />
                </div>
                <div className="field">
                  <label>Full Name</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
                </div>
                <div className="field">
                  <label>Roll Number</label>
                  <input type="text" value={newRoll} onChange={(e) => setNewRoll(e.target.value)} placeholder="Roll" />
                </div>
                <div className="field">
                  <label>Batch</label>
                  <input type="text" value={newBatch} onChange={(e) => setNewBatch(e.target.value)} placeholder="e.g. 2K22" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddHandleModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateHandle} disabled={isAddingHandle}>
                {isAddingHandle ? "Adding…" : "Add Handle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD TEAM (3 MEMBERS FORM)
          ════════════════════════════════════════════════════════════════════ */}
      {addTeamModalOpen && (
        <div className="modal-overlay" onClick={() => setAddTeamModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Team (3 Members)</h2>
              <button className="modal-close" onClick={() => setAddTeamModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {addTeamError && <div className="notice error" style={{ marginBottom: 12 }}>{addTeamError}</div>}
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Team Name *</label>
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Name (e.g. KUET_Alpha)" />
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label>VJudge Team Handle *</label>
                <input type="text" value={teamVjudgeHandle} onChange={(e) => setTeamVjudgeHandle(e.target.value)} placeholder="Team VJudge handle for rankings" />
              </div>

              {[0, 1, 2].map((i) => (
                <div key={i} className="member-section">
                  <div className="member-section-label">Member {i + 1}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label>Full Name *</label>
                      <input type="text" value={teamMembers[i].name} onChange={(e) => updateTeamMember(i, "name", e.target.value)} placeholder="Name" />
                    </div>
                    <div className="field">
                      <label>Roll Number *</label>
                      <input type="text" value={teamMembers[i].roll} onChange={(e) => updateTeamMember(i, "roll", e.target.value)} placeholder="Roll" />
                    </div>
                    <div className="field">
                      <label>Batch *</label>
                      <input type="text" value={teamMembers[i].batch} onChange={(e) => updateTeamMember(i, "batch", e.target.value)} placeholder="e.g. 2K22" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddTeamModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateTeam} disabled={isAddingTeam}>
                {isAddingTeam ? "Saving…" : "Save Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD CONTEST
          ════════════════════════════════════════════════════════════════════ */}
      {addContestModalOpen && (
        <div className="modal-overlay" onClick={() => setAddContestModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add VJudge Contest</h2>
              <button className="modal-close" onClick={() => setAddContestModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>Contest ID *</label>
                  <input type="text" value={contestIdInput} onChange={(e) => setContestIdInput(e.target.value)} placeholder="e.g. 123456" />
                </div>
                <div className="field">
                  <label>Contest Title (Optional)</label>
                  <input type="text" value={contestTitleInput} onChange={(e) => setContestTitleInput(e.target.value)} placeholder="Title" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddContestModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateContest} disabled={isAddingContest}>
                {isAddingContest ? "Adding…" : "Add Contest"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: HANDLE DETAIL (WITH PRACTICE & CF MAX RANKS)
          ════════════════════════════════════════════════════════════════════ */}
      {handleDetailModal && (
        <div className="modal-overlay" onClick={() => setHandleDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Participant Details</h2>
              <button className="modal-close" onClick={() => setHandleDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Handle",                <a href={`https://codeforces.com/profile/${handleDetailModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{handleDetailModal.handle}</a>],
                ["Name",                  handleDetailModal.name  || "Not provided"],
                ["Roll",                  handleDetailModal.roll  || "Not provided"],
                ["Batch",                 normalizeBatch(handleDetailModal.batch) || handleDetailModal.batch || "Not provided"],
                ["CF Max Rating",         <span className="stat-badge rating">{handleDetailModal.maxRating || "—"}</span>],
                ["Practice Rating",       <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{handleDetailModal.standingRating || 1000}</span>],
                ["Global Rank (Practice)",<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>#{practiceRankMap.get(String(handleDetailModal._id || handleDetailModal.id)) ?? "?"}</span>],
                ["Global Rank (CF Max)",  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--warning)" }}>#{cfMaxRankMap.get(String(handleDetailModal._id || handleDetailModal.id)) ?? "?"}</span>],
              ].map(([label, value]) => (
                <div key={label} className="detail-row">
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setHandleDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: TEAM DETAIL
          ════════════════════════════════════════════════════════════════════ */}
      {teamDetailModal && (
        <div className="modal-overlay" onClick={() => setTeamDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Team Details</h2>
              <button className="modal-close" onClick={() => setTeamDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Team Name", teamDetailModal.name],
                ["VJudge Handle", (teamDetailModal.aliases || []).join(", ") || "—"],
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
                {teamDetailModal.members && teamDetailModal.members.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {teamDetailModal.members.map((m, idx) => (
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
              <button className="secondary" onClick={() => setTeamDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: REQUEST DETAIL
          ════════════════════════════════════════════════════════════════════ */}
      {requestDetailModal && (
        <div className="modal-overlay" onClick={() => setRequestDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request Details</h2>
              <button className="modal-close" onClick={() => setRequestDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {requestDetailModal.type === "handle" && [
                ["Type", "Individual Handle"],
                ["Handle", <a href={`https://codeforces.com/profile/${requestDetailModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{requestDetailModal.handle}</a>],
                ["Name",  requestDetailModal.name  || "Not provided"],
                ["Roll",  requestDetailModal.roll  || "Not provided"],
                ["Batch", normalizeBatch(requestDetailModal.batch) || requestDetailModal.batch || "Not provided"],
              ].map(([label, value]) => (
                <div key={label} className="detail-row"><span className="detail-label">{label}</span><span className="detail-value">{value}</span></div>
              ))}
              {requestDetailModal.type === "reactivation" && [
                ["Type", "Reactivation Request"],
                ["Handle", <a href={`https://codeforces.com/profile/${requestDetailModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{requestDetailModal.handle}</a>],
                ["Name",  requestDetailModal.name  || "Not provided"],
                ["Batch", normalizeBatch(requestDetailModal.batch) || requestDetailModal.batch || "Not provided"],
              ].map(([label, value]) => (
                <div key={label} className="detail-row"><span className="detail-label">{label}</span><span className="detail-value">{value}</span></div>
              ))}
              {requestDetailModal.type === "team" && (
                <>
                  <div className="detail-row"><span className="detail-label">Type</span><span className="detail-value">Team Request</span></div>
                  <div className="detail-row"><span className="detail-label">Team Name</span><span className="detail-value" style={{ fontWeight: 700 }}>{requestDetailModal.teamName}</span></div>
                  <div className="detail-row"><span className="detail-label">VJudge Handles</span><span className="detail-value" style={{ fontFamily: "var(--font-mono)" }}>{requestDetailModal.teamHandles}</span></div>
                  {requestDetailModal.teamMembers && requestDetailModal.teamMembers.length > 0 && (
                    <>
                      <div style={{ marginTop: 14, marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>Team Members</div>
                      {requestDetailModal.teamMembers.map((m, i) => (
                        <div key={i} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--primary)", marginBottom: 4 }}>{m.handle}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.name} · {m.roll} · <span style={{ fontFamily: "var(--font-mono)" }}>{normalizeBatch(m.batch) || m.batch}</span></div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setRequestDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADMIN CREDENTIALS
          ════════════════════════════════════════════════════════════════════ */}
      {showCredentialsModal && (
        <div className="modal-overlay" onClick={() => setShowCredentialsModal(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Account Credentials</h2>
              <button className="modal-close" onClick={() => setShowCredentialsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="tabs" style={{ marginBottom: 14 }}>
                <button className={`tab ${credentialTab === "username" ? "active" : ""}`} onClick={() => setCredentialTab("username")}>Username</button>
                <button className={`tab ${credentialTab === "password" ? "active" : ""}`} onClick={() => setCredentialTab("password")}>Password</button>
              </div>

              {credMessage && <div className="notice success" style={{ marginBottom: 12 }}>{credMessage}</div>}
              {credError && <div className="notice error" style={{ marginBottom: 12 }}>{credError}</div>}

              {credentialTab === "username" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>Current Password *</label>
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                  </div>
                  <div className="field">
                    <label>New Username *</label>
                    <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="New username" />
                  </div>
                </div>
              )}
              {credentialTab === "password" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>Current Password *</label>
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                  </div>
                  <div className="field">
                    <label>New Password *</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
                  </div>
                  <div className="field">
                    <label>Confirm New Password *</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setShowCredentialsModal(false)}>Cancel</button>
              <button className="primary" onClick={handleUpdateCredentials}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: UPDATE PASSKEY
          ════════════════════════════════════════════════════════════════════ */}
      {showPasskeyModal && (
        <div className="modal-overlay" onClick={() => setShowPasskeyModal(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Update SGIPC Passkey</h2>
              <button className="modal-close" onClick={() => setShowPasskeyModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {passkeyMessage && <div className="notice info" style={{ marginBottom: 12 }}>{passkeyMessage}</div>}
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>New Passkey *</label>
                  <input type="password" value={passkeyValue} onChange={(e) => setPasskeyValue(e.target.value)} placeholder="Enter new passkey" />
                </div>
                <div className="field">
                  <label>Confirm Passkey *</label>
                  <input type="password" value={passkeyConfirm} onChange={(e) => setPasskeyConfirm(e.target.value)} placeholder="Confirm passkey" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setShowPasskeyModal(false)}>Cancel</button>
              <button className="primary" onClick={handleUpdatePasskey}>Update Passkey</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
