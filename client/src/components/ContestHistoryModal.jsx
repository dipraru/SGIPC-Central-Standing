import React, { useEffect } from "react";

const formatPenalty = (seconds) => {
  const num = Number(seconds);
  if (!Number.isFinite(num)) return "0";
  // Display standard penalty minutes or points
  return Math.round(num).toLocaleString();
};

export const ContestHistoryModal = ({ isOpen, onClose, contestant }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !contestant) return null;

  const history = contestant.contestsHistory || [];
  const totalSolved = history.reduce((sum, c) => sum + (c.solved || 0), 0);
  const bestRank = history.length > 0 ? Math.min(...history.map((c) => c.rank || Infinity)) : null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🏆</span>
              <span>{contestant.name}</span>
            </h2>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              Roll: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{contestant.roll || "—"}</strong>
              {contestant.batch && (
                <>
                  {" · "}Batch: <strong style={{ color: "var(--text-primary)" }}>{contestant.batch}</strong>
                </>
              )}
              {contestant.ratingDisplay && (
                <>
                  {" · "}Rating: <strong style={{ color: "var(--primary)" }}>{contestant.ratingDisplay}</strong>
                </>
              )}
              {" · "}
              <span style={{ color: "var(--success)", fontWeight: 600 }}>
                {history.length} {history.length === 1 ? "Contest" : "Contests"} Participated
              </span>
            </div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
            style={{ fontSize: 20, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <div className="modal-body" style={{ padding: "16px 20px", overflowY: "auto" }}>
          {history.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 0" }}>
              <p>No contest participation records found for this contestant.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Name of Contest</th>
                    <th style={{ width: 100, textAlign: "center" }}>Solved</th>
                    <th style={{ width: 110, textAlign: "right" }}>Penalty</th>
                    <th style={{ width: 120, textAlign: "center" }}>Rank (Real/Total)</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c) => {
                    const isTop3 = c.rank <= 3;
                    const rankBadgeCls = c.rank === 1 ? "gold" : c.rank === 2 ? "silver" : c.rank === 3 ? "bronze" : "";

                    return (
                      <tr key={c.contestId} style={{ background: c.excluded ? "rgba(239, 68, 68, 0.04)" : undefined }}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {c.contestTitle || `TFC Contest #${c.contestId}`}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                              #{c.contestId}
                            </span>
                            {c.excluded && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#dc2626",
                                  background: "rgba(239, 68, 68, 0.12)",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                Excluded
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                          {c.solved}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {formatPenalty(c.penalty)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                              padding: "3px 10px",
                              borderRadius: 999,
                              fontFamily: "var(--font-mono)",
                              fontWeight: 800,
                              fontSize: 12,
                              background:
                                c.rank === 1
                                  ? "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)"
                                  : c.rank === 2
                                  ? "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)"
                                  : c.rank === 3
                                  ? "linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)"
                                  : "var(--bg-subtle)",
                              color: isTop3 ? "#ffffff" : "var(--text-primary)",
                              border: `1px solid ${isTop3 ? "transparent" : "var(--border)"}`,
                            }}
                            title={`Rank ${c.rank} out of ${c.totalParticipants} total contestants`}
                          >
                            {c.rankDisplay || `${c.rank}/${c.totalParticipants}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <div>
            Total Solved: <strong style={{ color: "var(--text-primary)" }}>{totalSolved}</strong>
            {bestRank && bestRank !== Infinity && (
              <>
                {" · "}Best Rank: <strong style={{ color: "var(--primary)" }}>#{bestRank}</strong>
              </>
            )}
          </div>
          <button className="primary sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContestHistoryModal;
