import React, { useEffect, useState } from "react";
import {
  createHandle,
  deleteHandle,
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

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("individual");
  const [handles, setHandles] = useState([]);
  const [newHandle, setNewHandle] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoll, setNewRoll] = useState("");
  const [newBatch, setNewBatch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingHandleId, setEditingHandleId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingRoll, setEditingRoll] = useState("");
  const [editingBatch, setEditingBatch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamAliases, setTeamAliases] = useState("");
  const [contestIdInput, setContestIdInput] = useState("");
  const [contestTitleInput, setContestTitleInput] = useState("");
  const [vjudgeTeams, setVjudgeTeams] = useState([]);
  const [vjudgeContests, setVjudgeContests] = useState([]);
  const [vjudgeConfig, setVjudgeConfig] = useState({ eloMode: "normal" });
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamAliases, setEditingTeamAliases] = useState("");
  const [editingContestId, setEditingContestId] = useState(null);
  const [editingContestValue, setEditingContestValue] = useState("");
  const [editingContestTitle, setEditingContestTitle] = useState("");
  const [editingContestEnabled, setEditingContestEnabled] = useState(true);
  const [isAddingHandle, setIsAddingHandle] = useState(false);
  const [handleAddSuccess, setHandleAddSuccess] = useState(false);
  const [deletingHandleId, setDeletingHandleId] = useState(null);
  const [handleDeleteSuccessId, setHandleDeleteSuccessId] = useState(null);
  const [approvingRequestId, setApprovingRequestId] = useState(null);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [requestSuccessId, setRequestSuccessId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [requestsCount, setRequestsCount] = useState(0);
  const [passkeyValue, setPasskeyValue] = useState("");
  const [passkeyConfirm, setPasskeyConfirm] = useState("");
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credMessage, setCredMessage] = useState("");
  const [credError, setCredError] = useState("");
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialTab, setCredentialTab] = useState("username");
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [batchFilterOpen, setBatchFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleAuthError = (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("sgipc_token");
      window.location.href = "/admin";
      return true;
    }
    return false;
  };

  // Extract last 2 digits from batch string
  const extractBatchDigits = (batchStr) => {
    if (!batchStr) return null;
    const match = batchStr.match(/(\d{2})$/);
    return match ? match[1] : null;
  };

  // Normalize batch to format like "2K21"
  const normalizeBatch = (batchStr) => {
    const digits = extractBatchDigits(batchStr);
    return digits ? `2K${digits}` : null;
  };

  // Get all unique batches from handles
  const getAvailableBatches = () => {
    const batchSet = new Set();
    handles.forEach((row) => {
      const normalized = normalizeBatch(row.batch);
      if (normalized) batchSet.add(normalized);
    });
    return Array.from(batchSet).sort();
  };

  // Filter handles by selected batches
  const getFilteredHandles = () => {
    if (selectedBatches.length === 0) return handles;
    
    return handles.filter((row) => {
      const rowDigits = extractBatchDigits(row.batch);
      if (!rowDigits) return false;
      
      return selectedBatches.some((selectedBatch) => {
        const selectedDigits = extractBatchDigits(selectedBatch);
        return selectedDigits === rowDigits;
      });
    });
  };

  // Filter by search query (name or roll)
  const getSearchFilteredHandles = () => {
    const batchFiltered = getFilteredHandles();
    
    if (!searchQuery.trim()) return batchFiltered;
    
    const query = searchQuery.toLowerCase().trim();
    return batchFiltered.filter((row) => {
      const nameMatch = (row.name || "").toLowerCase().includes(query);
      const rollMatch = (row.roll || "").toLowerCase().includes(query);
      const handleMatch = (row.handle || "").toLowerCase().includes(query);
      return nameMatch || rollMatch || handleMatch;
    });
  };

  const toggleBatch = (batch) => {
    setSelectedBatches((prev) =>
      prev.includes(batch) ? prev.filter((b) => b !== batch) : [...prev, batch]
    );
  };

  const clearBatchFilter = () => {
    setSelectedBatches([]);
  };

  const loadHandles = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getHandles();
      setHandles(data);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError("Unable to load handles");
    } finally {
      setLoading(false);
    }
  };

  const loadVjudge = async () => {
    try {
      const [teams, contests, config] = await Promise.all([
        getVjudgeTeams(),
        getVjudgeContests(),
        getVjudgeConfig(),
      ]);
      setVjudgeTeams(teams);
      setVjudgeContests(contests);
      setVjudgeConfig(config || { eloMode: "normal" });
    } catch (err) {
      if (handleAuthError(err)) return;
      setError("Unable to load VJudge settings");
    }
  };

  const loadRequests = async () => {
    try {
      setRequestsLoading(true);
      setRequestsError("");
      const data = await getRequests("pending");
      setRequests(data);
      setRequestsCount(data.length || 0);
    } catch (err) {
      if (handleAuthError(err)) return;
      setRequestsError("Unable to load requests");
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadHandles();
    loadVjudge();
    loadRequests();
  }, []);

  useEffect(() => {
    if (activeTab === "requests") {
      loadRequests();
    }
  }, [activeTab]);

  const handleCreate = async () => {
    if (!newHandle.trim()) return;
    if (isAddingHandle) return;
    try {
      setIsAddingHandle(true);
      setHandleAddSuccess(false);
      await createHandle({ 
        handle: newHandle.trim(),
        name: newName.trim(),
        roll: newRoll.trim(),
        batch: newBatch.trim()
      });
      setNewHandle("");
      setNewName("");
      setNewRoll("");
      setNewBatch("");
      loadHandles();
      setHandleAddSuccess(true);
      setTimeout(() => setHandleAddSuccess(false), 1500);
    } catch (err) {
      const message = err?.response?.data?.message || "Unable to add handle";
      setError(message);
    } finally {
      setIsAddingHandle(false);
    }
  };

  const handleDelete = async (id) => {
    if (deletingHandleId) return;
    try {
      setDeletingHandleId(id);
      setHandleDeleteSuccessId(null);
      await deleteHandle(id);
      await loadHandles();
      setHandleDeleteSuccessId(id);
      setTimeout(() => setHandleDeleteSuccessId(null), 1500);
    } catch (err) {
      setError("Unable to delete handle");
    } finally {
      setDeletingHandleId(null);
    }
  };

  const startHandleEdit = (handle) => {
    setEditingHandleId(handle._id);
    setEditingName(handle.name || "");
    setEditingRoll(handle.roll || "");
    setEditingBatch(handle.batch || "");
  };

  const cancelHandleEdit = () => {
    setEditingHandleId(null);
    setEditingName("");
    setEditingRoll("");
    setEditingBatch("");
  };

  const handleUpdateHandle = async (id) => {
    try {
      await updateHandle(id, {
        name: editingName.trim(),
        roll: editingRoll.trim(),
        batch: editingBatch.trim()
      });
      cancelHandleEdit();
      loadHandles();
    } catch (err) {
      setError("Unable to update handle");
    }
  };

  const openModal = (handle) => {
    setModalData(handle);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalData(null);
  };

  const handleAddTeam = async () => {
    if (!teamName.trim()) return;
    try {
      await createVjudgeTeam({
        name: teamName.trim(),
        aliases: teamAliases,
      });
      setTeamName("");
      setTeamAliases("");
      loadVjudge();
    } catch (err) {
      setError("Unable to add team");
    }
  };

  const handleUpdateUsername = async () => {
    setCredMessage("");
    setCredError("");
    if (!currentPassword.trim()) {
      setCredError("Current password is required");
      return;
    }
    if (!newUsername.trim()) {
      setCredError("New username is required");
      return;
    }
    try {
      const payload = {
        currentPassword: currentPassword.trim(),
        newUsername: newUsername.trim(),
      };
      const data = await updateAdminCredentials(payload);
      if (data?.token) {
        localStorage.setItem("sgipc_token", data.token);
      }
      setCredMessage("Username updated successfully");
      setCurrentPassword("");
      setNewUsername("");
    } catch (err) {
      if (handleAuthError(err)) return;
      const msg = err?.response?.data?.message || "Unable to update username";
      setCredError(msg);
    }
  };

  const handleUpdatePassword = async () => {
    setCredMessage("");
    setCredError("");
    if (!currentPassword.trim()) {
      setCredError("Current password is required");
      return;
    }
    if (!newPassword.trim()) {
      setCredError("New password is required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredError("New passwords do not match");
      return;
    }
    try {
      const payload = {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      };
      const data = await updateAdminCredentials(payload);
      if (data?.token) {
        localStorage.setItem("sgipc_token", data.token);
      }
      setCredMessage("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (handleAuthError(err)) return;
      const msg = err?.response?.data?.message || "Unable to update password";
      setCredError(msg);
    }
  };

  const openCredentialsModal = () => {
    setShowCredentialsModal(true);
    setCredentialTab("username");
    setCredMessage("");
    setCredError("");
    setCurrentPassword("");
    setNewUsername("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const closeCredentialsModal = () => {
    setShowCredentialsModal(false);
    setCredMessage("");
    setCredError("");
    setCurrentPassword("");
    setNewUsername("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const openPasskeyModal = () => {
    setShowPasskeyModal(true);
    setPasskeyValue("");
    setPasskeyConfirm("");
    setPasskeyMessage("");
  };

  const closePasskeyModal = () => {
    setShowPasskeyModal(false);
    setPasskeyMessage("");
  };

  const handleDeleteTeam = async (id) => {
    try {
      await deleteVjudgeTeam(id);
      loadVjudge();
    } catch (err) {
      setError("Unable to delete team");
    }
  };

  const handleAddContest = async () => {
    if (!Number.isFinite(Number(contestIdInput.trim()))) {
      setError("Contest ID must be a number");
      return;
    }
    try {
      await createVjudgeContest({
        contestId: contestIdInput.trim(),
        title: contestTitleInput.trim(),
      });
      setContestIdInput("");
      setContestTitleInput("");
      loadVjudge();
    } catch (err) {
      setError("Unable to add contest");
    }
  };

  const startTeamEdit = (team) => {
    setEditingTeamId(team._id);
    setEditingTeamName(team.name || "");
    setEditingTeamAliases((team.aliases || []).join(", "));
  };

  const cancelTeamEdit = () => {
    setEditingTeamId(null);
    setEditingTeamName("");
    setEditingTeamAliases("");
  };

  const handleUpdateTeam = async (teamId) => {
    if (!editingTeamName.trim()) {
      setError("Team name is required");
      return;
    }
    try {
      await updateVjudgeTeam(teamId, {
        name: editingTeamName.trim(),
        aliases: editingTeamAliases,
      });
      cancelTeamEdit();
      loadVjudge();
    } catch (err) {
      setError("Unable to update team");
    }
  };

  const handleToggleContest = async (contest) => {
    try {
      await updateVjudgeContest(contest._id, {
        contestId: contest.contestId,
        title: contest.title,
        enabled: !contest.enabled,
      });
      loadVjudge();
    } catch (err) {
      setError("Unable to update contest");
    }
  };

  const handleDeleteContest = async (id) => {
    try {
      await deleteVjudgeContest(id);
      loadVjudge();
    } catch (err) {
      setError("Unable to delete contest");
    }
  };

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
      const msg = err?.response?.data?.message || "Unable to approve request";
      setRequestsError(msg);
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
      const msg = err?.response?.data?.message || "Unable to reject request";
      setRequestsError(msg);
    } finally {
      setRejectingRequestId(null);
    }
  };

  const handleUpdatePasskey = async () => {
    setPasskeyMessage("");
    if (!passkeyValue.trim() || !passkeyConfirm.trim()) {
      setPasskeyMessage("Passkey fields are required");
      return;
    }
    if (passkeyValue.trim() !== passkeyConfirm.trim()) {
      setPasskeyMessage("Passkeys do not match");
      return;
    }
    try {
      await updatePasskey({ newPasskey: passkeyValue.trim() });
      setPasskeyMessage("Passkey updated successfully");
      setPasskeyValue("");
      setPasskeyConfirm("");
      setTimeout(() => setPasskeyMessage(""), 1500);
    } catch (err) {
      const msg = err?.response?.data?.message || "Unable to update passkey";
      setPasskeyMessage(msg);
    }
  };

  const startContestEdit = (contest) => {
    setEditingContestId(contest._id);
    setEditingContestValue(String(contest.contestId || ""));
    setEditingContestTitle(contest.title || "");
    setEditingContestEnabled(Boolean(contest.enabled));
  };

  const cancelContestEdit = () => {
    setEditingContestId(null);
    setEditingContestValue("");
    setEditingContestTitle("");
    setEditingContestEnabled(true);
  };

  const handleUpdateContest = async (contestId) => {
    if (!Number.isFinite(Number(editingContestValue.trim()))) {
      setError("Contest ID must be a number");
      return;
    }
    try {
      await updateVjudgeContest(contestId, {
        contestId: editingContestValue.trim(),
        title: editingContestTitle.trim(),
        enabled: editingContestEnabled,
      });
      cancelContestEdit();
      loadVjudge();
    } catch (err) {
      setError("Unable to update contest");
    }
  };

  const handleConfigChange = async (event) => {
    const nextMode = event.target.value;
    try {
      const updated = await updateVjudgeConfig({ eloMode: nextMode });
      setVjudgeConfig(updated);
    } catch (err) {
      setError("Unable to update Elo mode");
    }
  };

  const logout = () => {
    localStorage.removeItem("sgipc_token");
    window.location.href = "/admin";
  };

  return (
    <div className="container">
      <div className="hero">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <span className="badge">Admin Dashboard</span>
            <h1>Manage SGIPC Platform</h1>
            <p>Configure handles, teams, and contest settings</p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button className="btn secondary" onClick={openCredentialsModal} style={{ height: "fit-content" }}>
              Change Credentials
            </button>
            <button className="btn secondary" onClick={openPasskeyModal} style={{ height: "fit-content" }}>
              Change Passkey
            </button>
            <button className="btn secondary" onClick={logout} style={{ height: "fit-content" }}>
              Logout
            </button>
          </div>
        </div>
      </div>



      <div className="tabs" style={{ marginBottom: "24px" }}>
        <button
          className={`tab ${activeTab === "individual" ? "active" : ""}`}
          onClick={() => setActiveTab("individual")}
        >
          Individual Standings
        </button>
        <button
          className={`tab ${activeTab === "team" ? "active" : ""}`}
          onClick={() => setActiveTab("team")}
        >
          Team Standings
        </button>
        <button
          className={`tab ${activeTab === "requests" ? "active" : ""}`}
          onClick={() => setActiveTab("requests")}
        >
          Requests
          {requestsCount > 0 && (
            <span
              style={{
                marginLeft: 8,
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                borderRadius: 999,
                background: "#e53935",
                color: "white",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {requestsCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "individual" && (
        <div className="card">
          <h2 style={{ marginBottom: "8px" }}>Codeforces Handles</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>Add or remove participant handles for individual standings</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label className="input-label">Codeforces Handle *</label>
              <input
                type="text"
                placeholder="e.g., tourist"
                value={newHandle}
                onChange={(event) => setNewHandle(event.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="input-label">Name</label>
              <input
                type="text"
                placeholder="Full name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="input-label">Roll Number</label>
              <input
                type="text"
                placeholder="e.g., 2024001"
                value={newRoll}
                onChange={(event) => setNewRoll(event.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="input-label">Batch</label>
              <input
                type="text"
                placeholder="e.g., 2024"
                value={newBatch}
                onChange={(event) => setNewBatch(event.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button
              className="primary"
              onClick={handleCreate}
              disabled={isAddingHandle}
            >
              {isAddingHandle ? "Adding..." : "Add Handle"}
            </button>
            {isAddingHandle && (
              <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></div>
            )}
            {handleAddSuccess && (
              <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Done</span>
            )}
          </div>

          {/* Batch Filter */}
          {!loading && !error && handles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button
                className="btn secondary"
                onClick={() => setBatchFilterOpen(!batchFilterOpen)}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                🎓 Filter by Batch
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  {batchFilterOpen ? "▲" : "▼"}
                </span>
              </button>
              {batchFilterOpen && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 16,
                    border: "1px solid var(--gray-300)",
                    borderRadius: 8,
                    backgroundColor: "var(--gray-50)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <strong style={{ fontSize: 14, color: "var(--gray-700)" }}>Select Batches:</strong>
                    {selectedBatches.length > 0 && (
                      <button
                        className="btn secondary"
                        onClick={clearBatchFilter}
                        style={{ padding: "4px 12px", fontSize: 13 }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  {selectedBatches.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {selectedBatches.map((batch) => (
                        <span
                          key={batch}
                          style={{
                            padding: "4px 12px",
                            backgroundColor: "var(--primary)",
                            color: "white",
                            borderRadius: 16,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {batch}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {getAvailableBatches().map((batch) => (
                      <label
                        key={batch}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: "pointer",
                          fontSize: 14,
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedBatches.includes(batch)}
                          onChange={() => toggleBatch(batch)}
                          style={{ cursor: "pointer" }}
                        />
                        <span>{batch}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search Filter */}
          {!loading && !error && handles.length > 0 && (
            <div style={{ marginBottom: 24, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", maxWidth: 400 }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search by Name, Roll, or Handle..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 16px 10px 40px",
                      fontSize: 14,
                      border: "2px solid var(--gray-300)",
                      borderRadius: 8,
                      outline: "none",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--gray-300)")}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 18,
                      color: "var(--gray-500)",
                    }}
                  >
                    🔍
                  </span>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        fontSize: 20,
                        color: "var(--gray-500)",
                        cursor: "pointer",
                        padding: "4px 8px",
                        lineHeight: 1,
                      }}
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p style={{ marginTop: 8, fontSize: 13, color: "var(--gray-600)", textAlign: "right" }}>
                    Found {getSearchFilteredHandles().length} result{getSearchFilteredHandles().length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

        {loading && (
          <div className="empty-state">
            <div className="loading-spinner"></div>
            <p>Loading handles...</p>
          </div>
        )}
        {!loading && error && <div className="notice" style={{ marginBottom: "16px" }}>{error}</div>}
        {!loading && !error && handles.length === 0 && (
          <div className="empty-state">
            <p>No handles added yet. Add your first Codeforces handle to get started.</p>
          </div>
        )}
        {!loading && !error && handles.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Handle</th>
                <th>Name</th>
                <th>Roll</th>
                <th>Batch</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {getSearchFilteredHandles().map((row) => (
                <tr key={row._id}>
                  <td><strong>{row.handle}</strong></td>
                  <td>
                    {editingHandleId === row._id ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="Name"
                        style={{ width: "100%" }}
                      />
                    ) : (
                      row.name || "-"
                    )}
                  </td>
                  <td>
                    {editingHandleId === row._id ? (
                      <input
                        type="text"
                        value={editingRoll}
                        onChange={(e) => setEditingRoll(e.target.value)}
                        placeholder="Roll"
                        style={{ width: "100%" }}
                      />
                    ) : (
                      row.roll || "-"
                    )}
                  </td>
                  <td>
                    {editingHandleId === row._id ? (
                      <input
                        type="text"
                        value={editingBatch}
                        onChange={(e) => setEditingBatch(e.target.value)}
                        placeholder="Batch"
                        style={{ width: "100%" }}
                      />
                    ) : (
                      row.batch || "-"
                    )}
                  </td>
                  <td>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      {editingHandleId === row._id ? (
                        <>
                          <button
                            className="primary"
                            onClick={() => handleUpdateHandle(row._id)}
                          >
                            Save
                          </button>
                          <button
                            className="secondary"
                            onClick={cancelHandleEdit}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            onClick={() => openModal(row)}
                          >
                            👁️ View
                          </button>
                          <button
                            className="secondary"
                            onClick={() => startHandleEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDelete(row._id)}
                            disabled={deletingHandleId === row._id}
                          >
                            {deletingHandleId === row._id ? "Deleting..." : "Delete"}
                          </button>
                          {deletingHandleId === row._id && (
                            <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                          )}
                          {handleDeleteSuccessId === row._id && (
                            <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Done</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      )}

      {activeTab === "team" && (
      <div className="card">
        <h2 style={{ marginBottom: "8px" }}>VJudge Team Standings</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>Configure teams, contests, and Elo rating mode</p>

        <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "8px", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--text-primary)" }}>Add New Team</h3>
          <div className="vjudge-grid">
            <div>
              <label className="input-label">Team Name</label>
              <input
                type="text"
                placeholder="e.g., SGIPC Alpha"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddTeam()}
              />
              <p className="input-help">Primary display name for the team</p>
            </div>
            <div>
              <label className="input-label">Team Aliases</label>
              <input
                type="text"
                placeholder="Comma separated (team_id, alt_id)"
                value={teamAliases}
                onChange={(event) => setTeamAliases(event.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddTeam()}
              />
              <p className="input-help">
                Alternate VJudge IDs for this team (best rank will be used)
              </p>
            </div>
          </div>
          <button className="primary" onClick={handleAddTeam} style={{ marginTop: "12px" }}>
            Add Team
          </button>
        </div>

        <h3 style={{ fontSize: "16px", marginBottom: "12px", marginTop: "24px", color: "var(--text-primary)" }}>Registered Teams</h3>
        {vjudgeTeams.length === 0 ? (
          <div className="empty-state">
            <p>No teams registered yet. Add your first team to get started.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Team Name</th>
                <th>Aliases</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vjudgeTeams.map((team) => (
                <tr key={team._id}>
                  <td>
                    {editingTeamId === team._id ? (
                      <input
                        type="text"
                        value={editingTeamName}
                        onChange={(event) => setEditingTeamName(event.target.value)}
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <strong>{team.name}</strong>
                    )}
                  </td>
                  <td>
                    {editingTeamId === team._id ? (
                      <input
                        type="text"
                        value={editingTeamAliases}
                        onChange={(event) => setEditingTeamAliases(event.target.value)}
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {team.aliases?.join(", ") || "No aliases"}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      {editingTeamId === team._id ? (
                        <>
                          <button
                            className="primary"
                            onClick={() => handleUpdateTeam(team._id)}
                          >
                            Save
                          </button>
                          <button className="secondary" onClick={cancelTeamEdit}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            onClick={() => startTeamEdit(team)}
                          >
                            Edit
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDeleteTeam(team._id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "32px" }}>
          <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--text-primary)" }}>Add New Contest</h3>
            <label className="input-label">Contest ID</label>
            <input
              type="text"
              placeholder="e.g., 123456"
              value={contestIdInput}
              onChange={(event) => setContestIdInput(event.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddContest()}
            />
            <label className="input-label" style={{ marginTop: "12px" }}>
              Contest Name (Optional)
            </label>
            <input
              type="text"
              placeholder="Leave blank to auto-fetch"
              value={contestTitleInput}
              onChange={(event) => setContestTitleInput(event.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddContest()}
            />
            <p className="input-help">
              If left blank, the contest name will be automatically fetched from VJudge
            </p>
            <button className="primary" onClick={handleAddContest} style={{ marginTop: "12px" }}>
              Add Contest
            </button>
          </div>
          <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--text-primary)" }}>Elo Rating Mode</h3>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="eloMode"
                  value="normal"
                  checked={vjudgeConfig.eloMode === "normal"}
                  onChange={handleConfigChange}
                />
                <div>
                  <strong>Classic Elo</strong>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>Standard rating system with gains and losses</p>
                </div>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="eloMode"
                  value="gain-only"
                  checked={vjudgeConfig.eloMode === "gain-only"}
                  onChange={handleConfigChange}
                />
                <div>
                  <strong>Gain-Only</strong>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>Rating only increases, never decreases</p>
                </div>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="eloMode"
                  value="zero-participation"
                  checked={vjudgeConfig.eloMode === "zero-participation"}
                  onChange={handleConfigChange}
                />
                <div>
                  <strong>Mandatory Participation</strong>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>Missing teams treated as 0 solves</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <h3 style={{ fontSize: "16px", marginBottom: "12px", marginTop: "32px", color: "var(--text-primary)" }}>Registered Contests</h3>
        {vjudgeContests.length === 0 ? (
          <div className="empty-state">
            <p>No contests registered yet. Add your first contest to get started.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Contest ID</th>
                <th>Contest Name</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vjudgeContests.map((contest) => (
                <tr key={contest._id}>
                  <td>
                    {editingContestId === contest._id ? (
                      <input
                        type="text"
                        value={editingContestValue}
                        onChange={(event) =>
                          setEditingContestValue(event.target.value)
                        }
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <code style={{ fontSize: "14px", background: "var(--bg-secondary)", padding: "4px 8px", borderRadius: "4px" }}>
                        {contest.contestId}
                      </code>
                    )}
                  </td>
                  <td>
                    {editingContestId === contest._id ? (
                      <input
                        type="text"
                        value={editingContestTitle}
                        onChange={(event) =>
                          setEditingContestTitle(event.target.value)
                        }
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <strong>{contest.title || "Untitled"}</strong>
                    )}
                  </td>
                  <td>
                    <span className={contest.enabled ? "badge" : "badge-secondary"}>
                      {contest.enabled ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      {editingContestId === contest._id ? (
                        <>
                          <button
                            className="primary"
                            onClick={() => handleUpdateContest(contest._id)}
                          >
                            Save
                          </button>
                          <button
                            className="secondary"
                            onClick={cancelContestEdit}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            onClick={() => startContestEdit(contest)}
                          >
                            Edit
                          </button>
                          <button
                            className={contest.enabled ? "secondary" : "primary"}
                            onClick={() => handleToggleContest(contest)}
                          >
                            {contest.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDeleteContest(contest._id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {activeTab === "requests" && (
        <div className="card">
          <h2 style={{ marginBottom: "8px" }}>Pending Requests</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>
            Approve or reject requests for handles and teams
          </p>

          {requestsLoading && (
            <div className="empty-state">
              <div className="loading-spinner"></div>
              <p>Loading requests...</p>
            </div>
          )}
          {!requestsLoading && requestsError && (
            <div className="notice error" style={{ marginBottom: 16 }}>
              {requestsError}
            </div>
          )}
          {!requestsLoading && !requestsError && requests.length === 0 && (
            <div className="empty-state">
              <p>No pending requests.</p>
            </div>
          )}

          {!requestsLoading && !requestsError && requests.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Details</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request._id}>
                    <td><strong>{request.type === "handle" ? "Handle" : "Team"}</strong></td>
                    <td>
                      {request.type === "handle" ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          <span><strong>{request.handle}</strong></span>
                          <span>{request.name} • {request.roll} • {request.batch}</span>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 4 }}>
                          <span><strong>{request.teamName}</strong></span>
                          <span style={{ color: "var(--text-secondary)" }}>{request.teamHandles}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="actions" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="primary"
                            onClick={() => handleApproveRequest(request._id)}
                            disabled={approvingRequestId === request._id || rejectingRequestId === request._id}
                          >
                            {approvingRequestId === request._id ? "Approving..." : "Approve"}
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleRejectRequest(request._id)}
                            disabled={approvingRequestId === request._id || rejectingRequestId === request._id}
                          >
                            {rejectingRequestId === request._id ? "Rejecting..." : "Reject"}
                          </button>
                          {(approvingRequestId === request._id || rejectingRequestId === request._id) && (
                            <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2, marginLeft: 8 }}></div>
                          )}
                          {requestSuccessId === request._id && (
                            <span style={{ color: "var(--success)", fontWeight: 600, marginLeft: 8 }}>✓ Done</span>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        </div>
      )}

      {/* Modal for viewing handle details */}
      {modalOpen && modalData && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Participant Details</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">Handle:</span>
                <span className="detail-value">
                  <a 
                    href={`https://codeforces.com/profile/${modalData.handle}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}
                  >
                    {modalData.handle}
                  </a>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{modalData.name || "Not provided"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Roll Number:</span>
                <span className="detail-value">{modalData.roll || "Not provided"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Batch:</span>
                <span className="detail-value">{modalData.batch || "Not provided"}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && (
        <div className="modal-overlay" onClick={closeCredentialsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Credentials</h2>
              <button className="modal-close" onClick={closeCredentialsModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="tabs" style={{ marginBottom: 16 }}>
                <button
                  className={`tab ${credentialTab === "username" ? "active" : ""}`}
                  onClick={() => setCredentialTab("username")}
                >
                  Change Username
                </button>
                <button
                  className={`tab ${credentialTab === "password" ? "active" : ""}`}
                  onClick={() => setCredentialTab("password")}
                >
                  Change Password
                </button>
              </div>

              {credMessage && <div className="notice success" style={{ marginBottom: 12 }}>{credMessage}</div>}
              {credError && <div className="notice error" style={{ marginBottom: 12 }}>{credError}</div>}

              {credentialTab === "username" && (
                <div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>New Username</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Enter new username"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                    <button className="btn secondary" onClick={closeCredentialsModal}>
                      Cancel
                    </button>
                    <button className="btn primary" onClick={handleUpdateUsername}>
                      Update Username
                    </button>
                  </div>
                </div>
              )}

              {credentialTab === "password" && (
                <div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                    <button className="btn secondary" onClick={closeCredentialsModal}>
                      Cancel
                    </button>
                    <button className="btn primary" onClick={handleUpdatePassword}>
                      Update Password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPasskeyModal && (
        <div className="modal-overlay" onClick={closePasskeyModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change SGIPC Passkey</h2>
              <button className="modal-close" onClick={closePasskeyModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <div className="field">
                  <label>New Passkey</label>
                  <input
                    type="password"
                    value={passkeyValue}
                    onChange={(e) => setPasskeyValue(e.target.value)}
                    placeholder="Enter new passkey"
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label>Confirm Passkey</label>
                  <input
                    type="password"
                    value={passkeyConfirm}
                    onChange={(e) => setPasskeyConfirm(e.target.value)}
                    placeholder="Confirm new passkey"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              {passkeyMessage && (
                <div className="notice" style={{ marginTop: 12 }}>{passkeyMessage}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={closePasskeyModal}>Cancel</button>
              <button className="primary" onClick={handleUpdatePasskey}>Update Passkey</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
