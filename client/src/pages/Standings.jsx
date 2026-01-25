import React, { useEffect, useState } from "react";
import { getStandings, getVjudgeStandings, submitHandleRequest, submitTeamRequest } from "../api.js";

const Standings = () => {
  const [activeTab, setActiveTab] = useState("individual");
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityModalData, setActivityModalData] = useState(null);
  const [teamStandings, setTeamStandings] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [eloMode, setEloMode] = useState("normal");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestTab, setRequestTab] = useState("handle");
  const [requestHandle, setRequestHandle] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestRoll, setRequestRoll] = useState("");
  const [requestBatch, setRequestBatch] = useState("");
  const [requestTeamName, setRequestTeamName] = useState("");
  const [requestTeamHandles, setRequestTeamHandles] = useState("");
  const [requestPasskey, setRequestPasskey] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const [lastTeamFetchAt, setLastTeamFetchAt] = useState(null);
  const CACHE_VERSION = "v2";
  const CACHE_TTL_MS = 2 * 60 * 1000;
  const MAX_CACHE_AGE_MS = 30 * 60 * 1000;

  const readCache = (key) => {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    try {
      const parsed = JSON.parse(cached);
      if (!parsed?.data) return null;

      const hasVersion = parsed?.version === CACHE_VERSION;
      const timestamp = parsed?.timestamp || Date.now();
      const age = Date.now() - timestamp;

      if (age > MAX_CACHE_AGE_MS) return null;

      return {
        ...parsed,
        timestamp,
        isStale: !hasVersion || age > CACHE_TTL_MS,
      };
    } catch (e) {
      return null;
    }
  };

  const writeCache = (key, payload) => {
    localStorage.setItem(
      key,
      JSON.stringify({ ...payload, version: CACHE_VERSION, timestamp: Date.now() })
    );
  };

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

  const getRatingLevel = (rating) => {
    if (rating < 1200) return { level: "Dead", class: "dead" };
    if (rating < 1400) return { level: "WarmUp", class: "warmup" };
    if (rating < 1800) return { level: "Trying", class: "trying" };
    if (rating < 2000) return { level: "TryingHard", class: "tryinghard" };
    if (rating < 2400) return { level: "Pushing", class: "pushing" };
    if (rating < 3000) return { level: "Hardcore", class: "hardcore" };
    return { level: "CompetingWithAliens", class: "aliens" };
  };

  const openActivityModal = (handle) => {
    setActivityModalData(handle);
    setActivityModalOpen(true);
  };

  const closeActivityModal = () => {
    setActivityModalOpen(false);
    setActivityModalData(null);
  };

  const openModal = (handle) => {
    setModalData(handle);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalData(null);
  };

  const openRequestModal = () => {
    setRequestModalOpen(true);
    setRequestTab("handle");
    setRequestHandle("");
    setRequestName("");
    setRequestRoll("");
    setRequestBatch("");
    setRequestTeamName("");
    setRequestTeamHandles("");
    setRequestPasskey("");
    setRequestError("");
    setRequestSuccess("");
  };

  const closeRequestModal = () => {
    setRequestModalOpen(false);
    setRequestError("");
    setRequestSuccess("");
  };

  const submitRequest = async () => {
    setRequestError("");
    setRequestSuccess("");
    if (requestSubmitting) return;

    if (requestTab === "handle") {
      if (!requestHandle.trim() || !requestName.trim() || !requestRoll.trim() || !requestBatch.trim() || !requestPasskey.trim()) {
        setRequestError("All fields are required.");
        return;
      }
    } else {
      if (!requestTeamName.trim() || !requestTeamHandles.trim() || !requestPasskey.trim()) {
        setRequestError("All fields are required.");
        return;
      }
    }

    try {
      setRequestSubmitting(true);
      if (requestTab === "handle") {
        await submitHandleRequest({
          handle: requestHandle.trim(),
          name: requestName.trim(),
          roll: requestRoll.trim(),
          batch: requestBatch.trim(),
          passkey: requestPasskey.trim(),
        });
      } else {
        await submitTeamRequest({
          teamName: requestTeamName.trim(),
          teamHandles: requestTeamHandles.trim(),
          passkey: requestPasskey.trim(),
        });
      }
      setRequestSuccess("Request submitted successfully.");
      setRequestHandle("");
      setRequestName("");
      setRequestRoll("");
      setRequestBatch("");
      setRequestTeamName("");
      setRequestTeamHandles("");
      setRequestPasskey("");
      setTimeout(() => setRequestSuccess(""), 1500);
    } catch (err) {
      const msg = err?.response?.data?.message || "Unable to submit request";
      setRequestError(msg);
    } finally {
      setRequestSubmitting(false);
    }
  };

  const fetchStandingsData = async (timeoutMs = 10000) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const data = await getStandings({ signal: controller.signal });
      clearTimeout(timeoutId);
      
      setStandings(data);
      setLastUpdated(new Date());
      setLastFetchAt(Date.now());
      setError("");
      // Cache in localStorage
      writeCache("individualStandings", { data });
      return true;
    } catch (err) {
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialLoad = async () => {
      // Try loading from cache first
      const cached = readCache('individualStandings');
      if (cached) {
        setStandings(cached.data || []);
        setLastUpdated(new Date(cached.timestamp));
        setError("");
        setLoading(false);
      } else {
        setLoading(true);
      }

      if (!cached || cached.isStale) {
        // Set a loading timeout to show cached data if fetch takes too long
        const loadingTimeout = setTimeout(() => {
          if (mounted && cached) {
            setLoading(false);
            setError("Using cached data (server slow to respond)");
          }
        }, 8000);

        const success = await fetchStandingsData(10000);
        clearTimeout(loadingTimeout);
        
        if (mounted) {
          if (!success) {
            if (cached) {
              // Keep showing cached data, just update error message
              setError("Using cached data (unable to refresh)");
            } else {
              setError("Unable to load standings");
            }
          }
          setLoading(false);
        }
      }
    };

    initialLoad();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTeamStandings = async () => {
      // Try loading from cache first
      const cached = readCache('teamStandings');
      if (cached) {
        const { data, eloMode: cachedElo } = cached;
        setTeamStandings(data?.standings || []);
        setEloMode(data?.eloMode || cachedElo || "normal");
        setTeamLoading(false);
        setTeamError("");
      } else {
        setTeamLoading(true);
      }

      if (!cached || cached.isStale) {
        // Set a loading timeout to show cached data if fetch takes too long
        const loadingTimeout = setTimeout(() => {
          if (active && cached) {
            setTeamLoading(false);
            setTeamError("Using cached data (server slow to respond)");
          }
        }, 8000);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const data = await getVjudgeStandings({ signal: controller.signal });
          clearTimeout(timeoutId);
          clearTimeout(loadingTimeout);
          
          if (!active) return;
          setTeamStandings(data.standings || []);
          setEloMode(data.eloMode || "normal");
          setTeamError("");
          setLastTeamFetchAt(Date.now());
          writeCache("teamStandings", { data, eloMode: data.eloMode });
        } catch (err) {
          clearTimeout(loadingTimeout);
          if (!active) return;
          if (cached) {
            setTeamError("Using cached data (unable to refresh)");
          } else {
            setTeamError("Unable to load team standings");
          }
        } finally {
          if (active) setTeamLoading(false);
        }
      }
    };
    loadTeamStandings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      if (!lastFetchAt || Date.now() - lastFetchAt > CACHE_TTL_MS) {
        fetchStandingsData(10000);
      }
      if (!lastTeamFetchAt || Date.now() - lastTeamFetchAt > CACHE_TTL_MS) {
        (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const data = await getVjudgeStandings({ signal: controller.signal });
            clearTimeout(timeoutId);
            
            setTeamStandings(data.standings || []);
            setEloMode(data.eloMode || "normal");
            setTeamError("");
            setLastTeamFetchAt(Date.now());
            writeCache("teamStandings", { data, eloMode: data.eloMode });
          } catch (err) {
            // Silently fail on background refresh
          }
        })();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [lastFetchAt, lastTeamFetchAt]);

  return (
    <div className="container">
      <div
        className="hero"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}
      >
        <div>
          <span className="badge">SGIPC Competitive Programming Club</span>
          <h1>Practice Standings</h1>
          <p>
            Live rankings based on Codeforces practice and VJudge team contests
          </p>
          <button className="btn secondary" onClick={openRequestModal} style={{ marginTop: 16 }}>
            Request to Join Standings
          </button>
        </div>
        <div style={{ flexShrink: 0 }}>
          <img
            src="/logo.png"
            alt="SGIPC logo"
            style={{ width: 120, height: 120, objectFit: "contain", filter: "invert(1) brightness(1000%) drop-shadow(0 2px 6px rgba(0,0,0,0.15))" }}
            loading="lazy"
          />
        </div>
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
            <>
              <div className="rating-legend">
                <strong style={{ marginRight: "8px", color: "var(--gray-700)" }}>Rating Levels:</strong>
                <div className="legend-item">
                  <div className="legend-color dead"></div>
                  <span>&lt;1200 Dead</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color warmup"></div>
                  <span>&lt;1400 WarmUp</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color trying"></div>
                  <span>&lt;1800 Trying</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color tryinghard"></div>
                  <span>&lt;2000 TryingHard</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color pushing"></div>
                  <span>&lt;2400 Pushing</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color hardcore"></div>
                  <span>&lt;3000 Hardcore</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color aliens"></div>
                  <span>≥3000 CompetingWithAliens</span>
                </div>
              </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rank</th>
                  <th>Handle</th>
                  <th style={{ width: 120 }}>Max Rating</th>
                  <th style={{ width: 100 }}>Solved</th>
                  <th style={{ width: 140 }}>Practice Rating</th>
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
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--gray-900)" }}>
                            {row.standingRating}
                          </span>
                          <span className={`rating-level ${getRatingLevel(row.standingRating).class}`}>
                            {getRatingLevel(row.standingRating).level}
                          </span>
                        </div>
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
                          onClick={() => openActivityModal(row)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </>
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
                  <th style={{ width: 140 }}>Team Rating</th>
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

      {requestModalOpen && (
        <div className="modal-overlay" onClick={closeRequestModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request to Join Standings</h2>
              <button className="modal-close" onClick={closeRequestModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="tabs" style={{ marginBottom: 16 }}>
                <button
                  className={`tab ${requestTab === "handle" ? "active" : ""}`}
                  onClick={() => setRequestTab("handle")}
                >
                  Individual
                </button>
                <button
                  className={`tab ${requestTab === "team" ? "active" : ""}`}
                  onClick={() => setRequestTab("team")}
                >
                  Team
                </button>
              </div>

              {requestError && <div className="notice error" style={{ marginBottom: 12 }}>{requestError}</div>}
              {requestSuccess && <div className="notice success" style={{ marginBottom: 12 }}>{requestSuccess}</div>}

              {requestTab === "handle" && (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                  <div className="field">
                    <label>Codeforces Handle</label>
                    <input
                      type="text"
                      value={requestHandle}
                      onChange={(e) => setRequestHandle(e.target.value)}
                      placeholder="e.g., tourist"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label>Name</label>
                    <input
                      type="text"
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      placeholder="Full name"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label>Roll</label>
                    <input
                      type="text"
                      value={requestRoll}
                      onChange={(e) => setRequestRoll(e.target.value)}
                      placeholder="Roll number"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label>Batch</label>
                    <input
                      type="text"
                      value={requestBatch}
                      onChange={(e) => setRequestBatch(e.target.value)}
                      placeholder="Batch"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>SGIPC Passkey</label>
                    <input
                      type="password"
                      value={requestPasskey}
                      onChange={(e) => setRequestPasskey(e.target.value)}
                      placeholder="Passkey"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              )}

              {requestTab === "team" && (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                  <div className="field">
                    <label>Team Name</label>
                    <input
                      type="text"
                      value={requestTeamName}
                      onChange={(e) => setRequestTeamName(e.target.value)}
                      placeholder="Team name"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label>VJudge Team Handles</label>
                    <input
                      type="text"
                      value={requestTeamHandles}
                      onChange={(e) => setRequestTeamHandles(e.target.value)}
                      placeholder="handle1, handle2"
                      autoComplete="off"
                    />
                    <p className="input-help">If multiple accounts, separate with commas.</p>
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>SGIPC Passkey</label>
                    <input
                      type="password"
                      value={requestPasskey}
                      onChange={(e) => setRequestPasskey(e.target.value)}
                      placeholder="Passkey"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={closeRequestModal}>Cancel</button>
              <button className="primary" onClick={submitRequest} disabled={requestSubmitting}>
                {requestSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
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

      {activityModalOpen && activityModalData && (
        <div className="modal-overlay" onClick={closeActivityModal}>
          <div
            className="modal-content"
            style={{ maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Recent Activity (Last 5 Days)</h2>
              <button className="modal-close" onClick={closeActivityModal}>×</button>
            </div>
            <div className="modal-body" style={{ overflowY: "auto" }}>
              {activityModalData.recentStats?.map((day) => (
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
            <div className="modal-footer">
              <button className="secondary" onClick={closeActivityModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Standings;
