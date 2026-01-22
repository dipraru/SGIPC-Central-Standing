import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginAdmin } from "../api.js";

const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      const data = await loginAdmin({ username, password });
      localStorage.setItem("sgipc_token", data.token);
      // Force reload to update auth state
      window.location.href = "/admin";
    } catch (err) {
      setError("Invalid login credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="hero">
        <span className="badge">Admin Access</span>
        <h1>SGIPC Admin Login</h1>
        <p>Sign in to manage Codeforces handles.</p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
          {error && <p className="notice">{error}</p>}
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
