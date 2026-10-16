import React, { useEffect } from "react";
import { getRatingLevel } from "../pages/Standings.jsx";

const normalizeBatch = (b) => {
  const m = (b || "").match(/(\d{2})$/);
  return m ? `2K${m[1]}` : b || "";
};

export const ActivityHistoryModal = ({ participant, onClose, onSync, isSyncing }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!participant) return null;

  const ratingVal = participant.standingRating ?? participant.rating ?? 1000;
  const tier = getRatingLevel(ratingVal);
  const recentStats = participant.recentStats || [];
  const initial = (participant.name || participant.handle || "P").charAt(0).toUpperCase();

  return (
    <div className="std-modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
      <div
        className="std-modal-card activity-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 660, width: "95%" }}
      >
        {/* Minimal & Smart Header */}
        <div className="std-modal-header" style={{ alignItems: "center", paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(56, 189, 248, 0.2) 100%)",
                border: "1px solid var(--border-medium)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 900,
                color: "var(--primary-light)",
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                {participant.name || participant.handle}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <a
                  href={`https://codeforces.com/profile/${participant.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="std-cf-link"
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  <span>{participant.handle}</span>
                  <span style={{ fontSize: 10 }}>↗</span>
                </a>

                {/* Roll Number - explicitly displayed */}
                {participant.roll && (
                  <span
                    className="std-roll-pill"
                    style={{
                      background: "rgba(99, 102, 241, 0.12)",
                      color: "var(--primary-light)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                    title="University Roll Number"
                  >
                    Roll: {participant.roll}
                  </span>
                )}

                {/* Batch Badge */}
                {participant.batch && (
                  <span className="std-batch-badge" style={{ fontSize: 11 }}>
                    {normalizeBatch(participant.batch)}
                  </span>
                )}

                {participant.isInactive && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: "rgba(239, 68, 68, 0.15)",
                      color: "#ef4444",
                      padding: "2px 8px",
                      borderRadius: 999,
                      textTransform: "uppercase",
                    }}
                  >
                    Inactive
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className="std-modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Structured 3-Card Summary Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            padding: "16px 20px",
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 0.5 }}>
              Practice Rating
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: tier.color, margin: "4px 0 2px" }}>
              {ratingVal}
            </div>
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                color: tier.color,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {tier.level}
            </span>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 0.5 }}>
              CF Peak Rating
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text-primary)", margin: "4px 0 2px" }}>
              {participant.maxRating || "—"}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Codeforces Max</span>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 0.5 }}>
              Total Solves
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--accent)", margin: "4px 0 2px" }}>
              {participant.solvedCount?.toLocaleString() || 0}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Problems Solved</span>
          </div>
        </div>

        {/* 5-Day Rating & Problem History */}
        <div className="activity-history-body" style={{ padding: "18px 20px 22px", maxHeight: "55vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)" }}>
              Recent Practice Trend &amp; Solves
            </h3>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Daily rating deltas &amp; submissions
            </span>
          </div>

          {recentStats.length === 0 ? (
            <div className="std-empty-state" style={{ padding: "30px 10px" }}>
              <p>No recent activity data available for this participant.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recentStats.map((day) => {
                const isPositive = day.delta > 0;
                const isNegative = day.delta < 0;
                const problems = day.problems || [];

                return (
                  <div
                    key={day.date}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "12px 14px",
                    }}
                  >
                    {/* Day Row Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: problems.length > 0 ? 10 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ fontSize: 14 }}>📅</span>
                        <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                          {day.date}
                        </strong>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                          {day.fromRating} → <strong style={{ color: "var(--text-primary)" }}>{day.toRating}</strong>
                        </span>
                        <span
                          className={`activity-delta-badge ${isPositive ? "positive" : isNegative ? "negative" : "neutral"}`}
                        >
                          {isPositive ? `+${day.delta}` : day.delta}
                        </span>
                      </div>
                    </div>

                    {/* Problems solved on that day */}
                    {problems.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {problems.map((p, idx) => {
                          const pUrl = `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
                          return (
                            <a
                              key={`${p.contestId}-${p.index}-${idx}`}
                              href={pUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 8px",
                                background: "var(--bg-card)",
                                border: "1px solid var(--border-medium)",
                                borderRadius: 6,
                                textDecoration: "none",
                                fontSize: 12,
                                color: "var(--text-primary)",
                                transition: "all 0.15s ease",
                              }}
                              title={`Open ${p.contestId}${p.index} on Codeforces`}
                            >
                              <span style={{ fontWeight: 800, color: "var(--primary-light)", fontFamily: "var(--font-mono)" }}>
                                {p.contestId}{p.index}
                              </span>
                              <span style={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {p.name}
                              </span>
                              {p.rating && (
                                <span className="activity-p-rating">
                                  ★ {p.rating}
                                </span>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic", marginTop: 4 }}>
                        No problems logged on this day
                      </div>
                    )}

                    {/* Pending problems */}
                    {day.pendingCount > 0 && (
                      <div className="activity-pending-note">
                        <span>⏳</span>
                        <span>
                          {day.pendingCount} pending problem{day.pendingCount > 1 ? "s" : ""} awaiting rating calculation
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="std-modal-footer" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", padding: "12px 20px" }}>
          {onSync && (
            <button
              type="button"
              className="secondary sm"
              onClick={() => onSync(participant.handle)}
              disabled={isSyncing}
              title="Resync solves from Codeforces"
            >
              <span>{isSyncing ? "Syncing CF…" : "🔄 Resync Handle"}</span>
            </button>
          )}
          <button type="button" className="primary sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
