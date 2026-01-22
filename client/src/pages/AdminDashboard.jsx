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
  const [contestIdsInput, setContestIdsInput] = useState("");
  const [vjudgeTeams, setVjudgeTeams] = useState([]);
  const [vjudgeContests, setVjudgeContests] = useState([]);
  const [vjudgeConfig, setVjudgeConfig] = useState({ eloMode: "normal" });

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
    const entries = contestIdsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (entries.length === 0) return;
    const invalid = entries.filter((item) => !Number.isFinite(Number(item)));
    if (invalid.length > 0) {
      setError(`Invalid contest IDs: ${invalid.join(", ")}`);
      return;
    }
    try {
      for (const entry of entries) {
        await createVjudgeContest({ contestId: entry });
      }
      setContestIdsInput("");
      loadVjudge();
    } catch (err) {
      setError("Unable to add contest");
    }
  };

  const handleToggleContest = async (contest) => {
    try {
      await updateVjudgeContest(contest._id, { enabled: !contest.enabled });
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
        <span className="badge">Admin Dashboard</span>
        <h1>Manage SGIPC Handles</h1>
        <p>Add or remove Codeforces handles.</p>
      </div>

      <div className="nav">
        <div className="form-row" style={{ maxWidth: 420 }}>
          <input
            type="text"
            placeholder="Add new handle"
            value={newHandle}
            onChange={(event) => setNewHandle(event.target.value)}
          />
          <button className="primary" onClick={handleCreate}>
            Add
          </button>
        </div>
        <button className="secondary" onClick={logout}>
          Logout
        </button>
      </div>

      <div className="card">
        {loading && <p>Loading handles...</p>}
        {!loading && error && <p className="notice">{error}</p>}
        {!loading && !error && handles.length === 0 && (
          <p>No handles added yet.</p>
        )}
        {!loading && !error && handles.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Handle</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {handles.map((row) => (
                <tr key={row._id}>
                  <td>{row.handle}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="primary"
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

      <div className="card" style={{ marginTop: 24 }}>
        <h2>VJudge Team Standings</h2>
        <p className="day-empty">Configure teams, contests, and Elo mode.</p>

        <div className="vjudge-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="input-label">Team name</label>
            <input
              type="text"
              placeholder="e.g., SGIPC Alpha"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
            />
            <p className="input-help">Primary display name for the team.</p>
          </div>
          <div>
            <label className="input-label">Team aliases</label>
            <input
              type="text"
              placeholder="Comma separated aliases (team_id, alt_id)"
              value={teamAliases}
              onChange={(event) => setTeamAliases(event.target.value)}
            />
            <p className="input-help">
              Add alternate VJudge IDs for the same team. Example: team_alpha, alpha_team
            </p>
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={handleAddTeam}>
            Add Team
          </button>
        </div>
        <div className="hint-box">
          Tip: If a team uses multiple IDs, list them as aliases so the best rank is used.
        </div>

        {vjudgeTeams.length === 0 ? (
          <p className="day-empty">No teams added yet.</p>
        ) : (
          <table className="table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Team</th>
                <th>Aliases</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vjudgeTeams.map((team) => (
                <tr key={team._id}>
                  <td>{team.name}</td>
                  <td>{team.aliases?.join(", ") || "-"}</td>
                  <td>
                    <button
                      className="primary"
                      onClick={() => handleDeleteTeam(team._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="vjudge-grid" style={{ marginTop: 20 }}>
          <div>
            <label className="input-label">Contest IDs</label>
            <input
              type="text"
              placeholder="Comma separated IDs (e.g., 123456, 789012)"
              value={contestIdsInput}
              onChange={(event) => setContestIdsInput(event.target.value)}
            />
            <p className="input-help">Add one or more contest IDs at once.</p>
            <button className="primary" onClick={handleAddContest}>
              Add Contest
            </button>
          </div>
          <div>
            <label className="input-label">Elo mode</label>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="eloMode"
                  value="zero-participation"
                  checked={vjudgeConfig.eloMode === "zero-participation"}
                  onChange={handleConfigChange}
                />
                <span>
                  Participation required (missing teams count as 0 solve)
                </span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="eloMode"
                  value="gain-only"
                  checked={vjudgeConfig.eloMode === "gain-only"}
                  onChange={handleConfigChange}
                />
                <span>Gain-only rating (no decreases)</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="eloMode"
                  value="normal"
                  checked={vjudgeConfig.eloMode === "normal"}
                  onChange={handleConfigChange}
                />
                <span>Classic Elo (default)</span>
              </label>
            </div>
          </div>
        </div>

        {vjudgeContests.length === 0 ? (
          <p className="day-empty">No contests added yet.</p>
        ) : (
          <table className="table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Contest ID</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vjudgeContests.map((contest) => (
                <tr key={contest._id}>
                  <td>{contest.contestId}</td>
                  <td>{contest.enabled ? "Yes" : "No"}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => handleToggleContest(contest)}
                      >
                        {contest.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="primary"
                        onClick={() => handleDeleteContest(contest._id)}
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
    </div>
  );
};

export default AdminDashboard;
