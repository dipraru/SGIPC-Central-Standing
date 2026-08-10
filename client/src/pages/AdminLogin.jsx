import React, { useState } from "react";
import { loginAdmin } from "../api.js";

const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const data = await loginAdmin({ username, password });
      localStorage.setItem("sgipc_token", data.token);
      window.location.href = "/admin";
    } catch {
      setError("Invalid login credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "var(--bg)" }}>
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <span className="badge" style={{ marginBottom: 14 }}>🔐 Admin Access</span>
          <h1>SGIPC Admin</h1>
          <p>Sign in to manage the standings platform</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Username</label>
            <input type="text" placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <div className="notice error">{error}</div>}
          <button className="primary" type="submit" disabled={loading} style={{ width: "100%", marginTop: 4 }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--text-muted)" }}>
          <a href="/" style={{ color: "var(--primary)", textDecoration: "none" }}>← Back to standings</a>
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
