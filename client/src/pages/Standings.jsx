import React, { useEffect, useState } from "react";
import { getStandings } from "../api.js";

const Standings = () => {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [openHandleId, setOpenHandleId] = useState(null);

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

  return (
    <div className="container">
      <div className="hero">
        <span className="badge">SGIPC Competitive Programming Club</span>
        <h1>Practice Standings</h1>
        <p>
          Rankings are calculated from Codeforces practice problems using an
          Elo-based system.
        </p>
      </div>

      <div className="nav">
        <div>
          {lastUpdated && (
            <span className="updated">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
        <a className="link" href="/admin">
          Admin Login
        </a>
      </div>

      <div className="card">
        {loading && <p>Loading standings...</p>}
        {!loading && error && <p className="notice">{error}</p>}
        {!loading && !error && standings.length === 0 && (
          <p>No handles added yet. Ask admin to add users.</p>
        )}
        {!loading && !error && standings.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Handle</th>
                <th>Max CF Rating</th>
                <th>Solved</th>
                <th>Standing Rating</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => (
                <React.Fragment key={row.id}>
                  <tr>
                    <td>{index + 1}</td>
                    <td>
                      <div className="handle-cell">
                        <span>{row.handle}</span>
                        <button
                          className="secondary dropdown-button"
                          onClick={() =>
                            setOpenHandleId(
                              openHandleId === row.id ? null : row.id
                            )
                          }
                        >
                          {openHandleId === row.id ? "Hide" : "Details"}
                        </button>
                      </div>
                    </td>
                    <td>{row.maxRating}</td>
                    <td>{row.solvedCount}</td>
                    <td>{row.standingRating}</td>
                  </tr>
                  {openHandleId === row.id && (
                    <tr>
                      <td colSpan={5}>
                        <div className="dropdown-panel">
                          {row.recentStats?.map((day) => (
                            <div key={day.date} className="day-block">
                              <div className="day-header">
                                <span>{day.date}</span>
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
                                <p className="day-empty">No problems solved</p>
                              ) : (
                                <ul className="problem-list">
                                  {day.problems.map((problem, idx) => (
                                    <li key={`${problem.contestId}-${problem.index}-${idx}`}>
                                      {problem.name} ({problem.rating})
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className="day-empty">
                                Pending rating problems: {day.pendingCount ?? 0}
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
    </div>
  );
};

export default Standings;
