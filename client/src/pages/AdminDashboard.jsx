import React, { useEffect, useState } from "react";
import {
  createHandle,
  deleteHandle,
  getHandles,
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
} from "../api.js";

const AdminDashboard = () => {
  const [handles, setHandles] = useState([]);
  const [newHandle, setNewHandle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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

  const handleAuthError = (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("sgipc_token");
      window.location.href = "/admin";
      return true;
    }
    return false;
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

  useEffect(() => {
    loadHandles();
    loadVjudge();
  }, []);

  const handleCreate = async () => {
    if (!newHandle.trim()) return;
    try {
      await createHandle({ handle: newHandle.trim() });
      setNewHandle("");
      loadHandles();
    } catch (err) {
      const message = err?.response?.data?.message || "Unable to add handle";
      setError(message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteHandle(id);
      loadHandles();
    } catch (err) {
      setError("Unable to delete handle");
    }
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
          <button className="secondary" onClick={logout} style={{ height: "fit-content" }}>
            Logout
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "8px" }}>Codeforces Handles</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>Add or remove participant handles for individual standings</p>
        
        <div className="form-row" style={{ marginBottom: "24px" }}>
          <input
            type="text"
            placeholder="Enter Codeforces handle"
            value={newHandle}
            onChange={(event) => setNewHandle(event.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleCreate()}
          />
          <button className="primary" onClick={handleCreate}>
            Add Handle
          </button>
        </div>

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
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {handles.map((row) => (
                <tr key={row._id}>
                  <td><strong>{row.handle}</strong></td>
                  <td>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="danger"
                        onClick={() => handleDelete(row._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
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
    </div>
  );
};

export default AdminDashboard;
