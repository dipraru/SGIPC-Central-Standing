import React, { useEffect, useState } from "react";
import { getStandings } from "../api.js";

const Standings = () => {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStandings = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getStandings();
      setStandings(data);
    } catch (err) {
      setError("Unable to load standings right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStandings();
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
        <button className="secondary" onClick={loadStandings}>
          Refresh Standings
        </button>
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
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.handle}</td>
                  <td>{row.maxRating}</td>
                  <td>{row.solvedCount}</td>
                  <td>{row.standingRating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Standings;
