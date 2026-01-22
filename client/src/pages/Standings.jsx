import React, { useEffect, useState } from "react";
import { getStandings, getVjudgeStandings } from "../api.js";

const Standings = () => {
  const [activeTab, setActiveTab] = useState("individual");
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [openHandleId, setOpenHandleId] = useState(null);
  const [teamStandings, setTeamStandings] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [eloMode, setEloMode] = useState("normal");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const eloModeLabels = {
    normal: "Classic Elo",
    "gain-only": "Gain-only",
    "zero-participation": "Participation Required",
  };

  const getRankBadgeClass = (rank) => {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "default";
  };

  const toggleHandle = (id) => {
    setOpenHandleId(openHandleId === id ? null : id);
  };

  const openModal = (handle) => {
    setModalData(handle);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalData(null);
  };

  const fetchStandingsData = async () => {
    try {
      const data = await getStandings();
      setStandings(data);
      setLastUpdated(new Date());
      setError("");
      return true;
    } catch (err) {
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialLoad = async () => {
      setLoading(true);
      let success = false;
      while (mounted && !success) {
        success = await fetchStandingsData();
        if (!success) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      if (mounted) setLoading(false);
    };

    initialLoad().then(() => {
      // Start silent polling only after initial load succeeds
      const interval = setInterval(() => {
        if (mounted) fetchStandingsData();
      }, 20000);
      return () => clearInterval(interval);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTeamStandings = async () => {
      try {
        setTeamLoading(true);
        const data = await getVjudgeStandings();
        if (!active) return;
        setTeamStandings(data.standings || []);
        setEloMode(data.eloMode || "normal");
        setTeamError("");
      } catch (err) {
        if (!active) return;
        setTeamError("Unable to load team standings");
      } finally {
        if (active) setTeamLoading(false);
      }
    };
    loadTeamStandings();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="container">
      <div className="hero">
        <span className="badge">SGIPC Competitive Programming Club</span>
        <h1>Practice Standings</h1>
        <p>
          Live rankings based on Codeforces practice and VJudge team contests
        </p>
      </div>

      <div className="tabs">
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
      </div>

      {activeTab === "individual" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2>Individual Rankings</h2>
              <p className="card-subtitle">Elo-based ratings from Codeforces practice problems</p>
            </div>
            {lastUpdated && (
              <span style={{ fontSize: 13, color: "var(--gray-500)" }}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {loading && (
            <div className="empty-state">
              <div className="loading-spinner" style={{ borderTopColor: "var(--primary)" }}></div>
              <p style={{ marginTop: 16 }}>Loading standings...</p>
            </div>
          )}
          {!loading && error && <div className="notice error">{error}</div>}
          {!loading && !error && standings.length === 0 && (
            <div className="empty-state">
              <p>No participants yet. Contact admin to add handles.</p>
            </div>
          )}
          {!loading && !error && standings.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rank</th>
                  <th>Handle</th>
                  <th style={{ width: 120 }}>Max Rating</th>
                  <th style={{ width: 100 }}>Solved</th>
                  <th style={{ width: 140 }}>Elo Rating</th>
                  <th style={{ width: 80 }}>Info</th>
                  <th style={{ width: 100 }}>Activity</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <React.Fragment key={row.id}>
                    <tr>
                      <td>
                        <div className={`rank-badge ${getRankBadgeClass(index + 1)}`}>
                          {index + 1}
                        </div>
                      </td>
                      <td>
                        <a 
                          href={`https://codeforces.com/profile/${row.handle}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="handle-name"
                          style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}
                        >
                          {row.handle}
                        </a>
                      </td>
                      <td>
                        <span className="stat-badge rating">{row.maxRating}</span>
                      </td>
                      <td>
                        <span className="stat-badge solved">{row.solvedCount}</span>
                      </td>
                      <td style={{ fontWeight: 700, fontSize: 16, color: "var(--primary)" }}>
                        {row.standingRating}
                      </td>
                      <td>
                        <button
                          className="secondary sm"
                          onClick={() => openModal(row)}
                          title="View participant info"
                        >
                          👁️
                        </button>
                      </td>
                      <td>
                        <button
                          className="secondary sm"
                          onClick={() => toggleHandle(row.id)}
                        >
                          {openHandleId === row.id ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {openHandleId === row.id && (
                      <tr>
                        <td colSpan={7}>
                          <div className="dropdown-panel">
                            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
                              Recent Activity (Last 5 Days)
                            </h3>
                            {row.recentStats?.map((day) => (
                              <div key={day.date} className="day-block">
                                <div className="day-header">
                                  <span style={{ fontSize: 14 }}>{day.date}</span>
                                  <div className="delta-block">
                                    <span className="delta-meta">
                                      {day.fromRating} → {day.toRating}
                                    </span>
                                    <span
                                      className={
                                        day.delta >= 0
                                          ? "delta-positive"
                                          : "delta-negative"
                                      }
                                    >
                                      {day.delta >= 0 ? "+" : ""}
                                      {day.delta}
                                    </span>
                                  </div>
                                </div>
                                {day.problems.length === 0 ? (
                                  <p className="day-empty">No problems solved this day</p>
                                ) : (
                                  <ul className="problem-list">
                                    {day.problems.map((problem, idx) => (
                                      <li key={`${problem.contestId}-${problem.index}-${idx}`}>
                                        <strong>{problem.name}</strong> — Rating: {problem.rating}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <p className="day-empty" style={{ marginTop: 8 }}>
                                  Pending unrated: {day.pendingCount ?? 0} problems
                                </p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "team" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2>Team Rankings</h2>
              <p className="card-subtitle">VJudge contest performance • Mode: {eloModeLabels[eloMode]}</p>
            </div>
          </div>

          {teamLoading && (
            <div className="empty-state">
              <div className="loading-spinner" style={{ borderTopColor: "var(--primary)" }}></div>
              <p style={{ marginTop: 16 }}>Loading team standings...</p>
            </div>
          )}
          {!teamLoading && teamError && <div className="notice error">{teamError}</div>}
          {!teamLoading && !teamError && teamStandings.length === 0 && (
            <div className="empty-state">
              <p>No team standings yet. Contact admin to configure teams and contests.</p>
            </div>
          )}
          {!teamLoading && !teamError && teamStandings.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rank</th>
                  <th>Team Name</th>
                  <th style={{ width: 140 }}>Elo Rating</th>
                  <th style={{ width: 100 }}>Contests</th>
                  <th style={{ width: 140 }}>W-L-D</th>
                </tr>
              </thead>
              <tbody>
                {teamStandings.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className={`rank-badge ${getRankBadgeClass(row.rank)}`}>
                        {row.rank}
                      </div>
                    </td>
                    <td>
                      <span className="handle-name">{row.name}</span>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 16, color: "var(--primary)" }}>
                      {row.ratingDisplay}
                    </td>
                    <td>{row.contests}</td>
                    <td>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>{row.wins}</span>
                      {" - "}
                      <span style={{ color: "var(--danger)", fontWeight: 600 }}>{row.losses}</span>
                      {" - "}
                      <span style={{ color: "var(--gray-500)", fontWeight: 600 }}>{row.draws}</span>
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
    </div>
  );
};

export default Standings;
