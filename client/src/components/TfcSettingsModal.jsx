import React, { useState, useEffect } from "react";
import { getAdminTfcConfig, updateAdminTfcConfig } from "../api.js";

export const TfcSettingsModal = ({ isOpen, onClose, onConfigSaved }) => {
  const [publicTopN, setPublicTopN] = useState("10");
  const [publicMinPart, setPublicMinPart] = useState("0");
  const [adminTopN, setAdminTopN] = useState("0");
  const [adminMinPart, setAdminMinPart] = useState("0");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    setError("");
    setSuccessToast("");

    getAdminTfcConfig()
      .then((data) => {
        if (!isMounted) return;
        setPublicTopN(String(data.publicTopNLimit !== undefined ? data.publicTopNLimit : (data.topNLimit || 10)));
        setPublicMinPart(String(data.publicMinParticipation !== undefined ? data.publicMinParticipation : 0));
        setAdminTopN(String(data.adminTopNLimit !== undefined ? data.adminTopNLimit : 0));
        setAdminMinPart(String(data.adminMinParticipation !== undefined ? data.adminMinParticipation : 0));
      })
      .catch(() => {
        if (isMounted) setError("Failed to load current configuration settings.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      isMounted = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const pTop = Math.max(0, parseInt(publicTopN, 10) || 0);
    const pMin = Math.max(0, parseInt(publicMinPart, 10) || 0);
    const aTop = Math.max(0, parseInt(adminTopN, 10) || 0);
    const aMin = Math.max(0, parseInt(adminMinPart, 10) || 0);

    try {
      const res = await updateAdminTfcConfig({
        publicTopNLimit: pTop,
        topNLimit: pTop,
        publicMinParticipation: pMin,
        adminTopNLimit: aTop,
        adminMinParticipation: aMin,
      });

      setSuccessToast("TFC standings configuration saved successfully!");
      if (onConfigSaved) {
        onConfigSaved({
          publicTopNLimit: pTop,
          topNLimit: pTop,
          publicMinParticipation: pMin,
          adminTopNLimit: aTop,
          adminMinParticipation: aMin,
        });
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update configuration.");
    } finally {
      setSaving(false);
    }
  };

  const parsedPublicTop = parseInt(publicTopN, 10);
  const parsedPublicMin = parseInt(publicMinPart, 10);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "16px",
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          width: "100%",
          maxWidth: 540,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚙️</span>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                TFC Standings Settings
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                Configure participant visibility &amp; participation criteria
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: "var(--text-muted)",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave}>
          <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
            {error && (
              <div className="notice error" style={{ margin: 0, padding: "8px 12px", fontSize: 13 }}>
                {error}
              </div>
            )}
            {successToast && (
              <div className="notice success" style={{ margin: 0, padding: "8px 12px", fontSize: 13, background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
                {successToast}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>
                <div className="loading-spinner" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 13 }}>Loading settings…</p>
              </div>
            ) : (
              <>
                {/* ── Section 1: Public Standings ── */}
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius, 8px)",
                    padding: "16px",
                    background: "var(--bg-subtle, rgba(255, 255, 255, 0.02))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 16 }}>🌐</span>
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Public Standings Settings
                    </h3>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 14px 0" }}>
                    Determines what students and visitors see on the public TFC Corner page.
                  </p>

                  <div style={{ display: "grid", gap: 14 }}>
                    {/* Public Limit Input */}
                    <div className="field">
                      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
                        <span>Number of Participants to Show</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>0 = Show All</span>
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={publicTopN}
                          onChange={(e) => setPublicTopN(e.target.value)}
                          placeholder="e.g. 10 (any number)"
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "var(--radius, 6px)",
                            border: "1px solid var(--border)",
                            background: "var(--bg-input, var(--bg-card))",
                            color: "var(--text-primary)",
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>contestants</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Enter any number (e.g. 5, 10, 25, 100). Enter <strong>0</strong> to display all participants with no limit.
                      </div>
                    </div>

                    {/* Public Min Participation Input */}
                    <div className="field">
                      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
                        <span>Minimum Contest Participation</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>0 = No Minimum</span>
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={publicMinPart}
                          onChange={(e) => setPublicMinPart(e.target.value)}
                          placeholder="e.g. 1 (any number)"
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "var(--radius, 6px)",
                            border: "1px solid var(--border)",
                            background: "var(--bg-input, var(--bg-card))",
                            color: "var(--text-primary)",
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>contests</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Only contestants who participated in at least this many contests will appear publicly. Enter <strong>0</strong> to include everyone.
                      </div>
                    </div>

                    {/* Live Preview Banner */}
                    <div
                      style={{
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.2)",
                        borderRadius: "var(--radius, 6px)",
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        lineHeight: 1.4,
                      }}
                    >
                      <strong>Preview:</strong> Public view will show the{" "}
                      <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                        {isNaN(parsedPublicTop) || parsedPublicTop <= 0 ? "All" : `top ${parsedPublicTop}`}
                      </span>{" "}
                      contestants
                      {parsedPublicMin > 0 ? (
                        <span>
                          {" "}who have participated in at least{" "}
                          <span style={{ color: "#d97706", fontWeight: 700 }}>
                            {parsedPublicMin} {parsedPublicMin === 1 ? "contest" : "contests"}
                          </span>.
                        </span>
                      ) : (
                        <span> with no minimum contest participation required.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Admin Interface Full Standings ── */}
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius, 8px)",
                    padding: "16px",
                    background: "var(--bg-subtle, rgba(255, 255, 255, 0.02))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 16 }}>🛡️</span>
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Admin Full Standings Settings
                    </h3>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 14px 0" }}>
                    Sets default display limits and filters for the Admin Dashboard Full Standings tab.
                  </p>

                  <div style={{ display: "grid", gap: 14 }}>
                    {/* Admin Limit Input */}
                    <div className="field">
                      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
                        <span>Default Display Limit in Admin</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>0 = Show All</span>
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={adminTopN}
                          onChange={(e) => setAdminTopN(e.target.value)}
                          placeholder="e.g. 50 (0 for All)"
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "var(--radius, 6px)",
                            border: "1px solid var(--border)",
                            background: "var(--bg-input, var(--bg-card))",
                            color: "var(--text-primary)",
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>rows</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Controls initial row count before "Load More" is triggered. Enter <strong>0</strong> to load all at once.
                      </div>
                    </div>

                    {/* Admin Min Participation Input */}
                    <div className="field">
                      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
                        <span>Default Min Participation Filter</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>0 = No Minimum</span>
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={adminMinPart}
                          onChange={(e) => setAdminMinPart(e.target.value)}
                          placeholder="e.g. 1 (0 for All)"
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "var(--radius, 6px)",
                            border: "1px solid var(--border)",
                            background: "var(--bg-input, var(--bg-card))",
                            color: "var(--text-primary)",
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>contests</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Sets the default minimum contest threshold for admin full standings (can also be toggled anytime in the toolbar).
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              background: "var(--bg-subtle)",
            }}
          >
            <button
              type="button"
              className="secondary sm"
              onClick={onClose}
              disabled={saving}
              style={{ padding: "7px 16px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary sm"
              disabled={saving || loading}
              style={{ padding: "7px 20px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>{saving ? "Saving Changes…" : "✓ Save Settings"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TfcSettingsModal;
