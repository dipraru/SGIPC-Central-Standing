import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getTfcParticipant, submitTfcReport } from "../api.js";

const extractBatchDigits = (b) => { const m = (b || "").match(/(\d{2})$/); return m ? m[1] : null; };
const normalizeBatch = (b) => { const d = extractBatchDigits(b); return d ? `2K${d}` : null; };

const TfcVideoViewer = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const handleBack = (e) => {
    if (e) e.preventDefault();
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/tfc");
    }
  };
  const [participant, setParticipant] = useState(null);
  const [videos, setVideos] = useState([]);
  const [ytInfo, setYtInfo] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [targetVideo, setTargetVideo] = useState(null);
  const [reportCategory, setReportCategory] = useState("Screen Recording Irregularity");
  const [reportExplanation, setReportExplanation] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportDone, setReportDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const data = await getTfcParticipant(id);
        if (alive) {
          setParticipant(data.participant);
          setYtInfo(data.ytInfo);
          const vids = data.videos || [];
          setVideos(vids);
          if (vids.length > 0) {
            setSelectedVideo(vids[0]);
          }
          setError("");
        }
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || "Failed to load contestant video recordings.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchDetails();
    return () => { alive = false; };
  }, [id]);

  const openReportModal = (video) => {
    setTargetVideo(video || selectedVideo);
    setReportCategory("Screen Recording Irregularity");
    setReportExplanation("");
    setReportError("");
    setReportDone(false);
    setReportModalOpen(true);
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!reportExplanation.trim()) {
      return setReportError("Please describe the issue or irregularity.");
    }
    setReportLoading(true);
    setReportError("");
    try {
      await submitTfcReport({
        participantId: participant?._id,
        participantName: participant?.name,
        participantRoll: participant?.roll,
        participantBatch: participant?.batch,
        videoTitle: targetVideo?.title || "Contest Recording",
        videoUrl: targetVideo?.url || participant?.playlistUrl || "",
        category: reportCategory,
        explanation: reportExplanation.trim(),
      });
      setReportDone(true);
      // Increment report count on target video immediately
      setVideos((prev) =>
        prev.map((v) => {
          const isMatch =
            (targetVideo?.videoId && v.videoId === targetVideo.videoId) ||
            (targetVideo?.url && v.url === targetVideo.url) ||
            (targetVideo?.title && v.title === targetVideo.title);
          return isMatch ? { ...v, reportCount: (v.reportCount || 0) + 1 } : v;
        })
      );
      if (selectedVideo) {
        const isMatch =
          (targetVideo?.videoId && selectedVideo.videoId === targetVideo.videoId) ||
          (targetVideo?.url && selectedVideo.url === targetVideo.url) ||
          (targetVideo?.title && selectedVideo.title === targetVideo.title);
        if (isMatch) {
          setSelectedVideo((prev) => ({ ...prev, reportCount: (prev.reportCount || 0) + 1 }));
        }
      }
    } catch (err) {
      setReportError(err?.response?.data?.message || "Failed to submit anonymous report.");
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading contestant recordings and video hub...</p>
        </div>
      </div>
    );
  }

  if (error || !participant) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="notice error">{error || "Contestant not found."}</div>
        <div style={{ marginTop: 20 }}>
          <Link to="/tfc" onClick={handleBack} className="secondary sm">← Back to TFC Corner</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* ── BREADCRUMB & BACK ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
          <Link to="/tfc" onClick={handleBack} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
            ← TFC Corner
          </Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{participant.name}</span>
          <span className="badge" style={{ fontSize: 11, padding: "2px 8px" }}>
            {normalizeBatch(participant.batch) || participant.batch}
          </span>
        </div>

        {participant.playlistUrl && participant.playlistUrl !== "N/A" && (
          <a
            href={participant.playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
          >
            <span>Open on YouTube ↗</span>
          </a>
        )}
      </div>

      {/* ── CONTESTANT PROFILE CARD ───────────────────────────────────────── */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          padding: "16px 20px",
          background: "linear-gradient(135deg, var(--bg-white) 0%, var(--bg-subtle) 100%)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "var(--text-primary)" }}>
              {participant.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              <span>Roll: <strong style={{ color: "var(--text-primary)" }}>{participant.roll}</strong></span>
              <span>·</span>
              <span>Batch: <strong style={{ color: "var(--text-primary)" }}>{normalizeBatch(participant.batch) || participant.batch}</strong></span>
            </div>
          </div>

          {/* Handles Badges */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {participant.codeforcesHandle && (
              <a
                href={`https://codeforces.com/profile/${participant.codeforcesHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "rgba(37, 99, 235, 0.08)",
                  border: "1px solid rgba(37, 99, 235, 0.25)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--primary)",
                  textDecoration: "none",
                }}
              >
                <span>CF:</span> <strong>{participant.codeforcesHandle}</strong>
              </a>
            )}

            {participant.vjudgeHandles && participant.vjudgeHandles.length > 0 && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span>VJ:</span> <strong>{participant.vjudgeHandles.join(", ")}</strong>
              </div>
            )}

            {participant.otherOjs && participant.otherOjs.map((o, idx) => (
              <div
                key={idx}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span>{o.ojName}:</span> <strong>{o.handle}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RECORDINGS DISPLAY OR NO RECORDINGS STATE ─────────────────────────── */}
      {videos.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "48px 24px",
            border: "1px solid var(--border)",
            background: "var(--bg-white)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(100, 116, 139, 0.1)",
              border: "1.5px solid var(--border)",
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              margin: "0 auto 16px",
            }}
          >
            📹
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "var(--text-primary)" }}>
            No Valid Recordings Available
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, maxWidth: 480, margin: "0 auto 20px", lineHeight: 1.5 }}>
            {!participant.playlistUrl || participant.playlistUrl === "N/A"
              ? "This contestant has not submitted a screen recording playlist or video link yet."
              : !ytInfo?.id
              ? "The submitted recording link is invalid or unsupported. Please verify the URL format."
              : "No video recordings could be found in the submitted playlist. The playlist might be private or empty."}
          </p>

          {participant.playlistUrl && participant.playlistUrl !== "N/A" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                marginBottom: 20,
                fontSize: 12,
                color: "var(--text-muted)",
                maxWidth: "100%",
                wordBreak: "break-all",
              }}
            >
              <span>Submitted Link:</span>
              <a
                href={participant.playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "underline" }}
              >
                {participant.playlistUrl}
              </a>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
            <Link to="/tfc" onClick={handleBack} className="secondary sm">
              ← Back to TFC Corner
            </Link>
            {participant.playlistUrl && participant.playlistUrl !== "N/A" && (
              <a
                href={participant.playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="primary sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>Check Link on YouTube ↗</span>
              </a>
            )}
          </div>
        </div>
      ) : (
        /* ── VIDEO PLAYER & DIRECTORY PLAYLIST ─────────────────────────────── */
        <div className="tfc-video-hub-layout">
          {/* Left: Cinema Player */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tfc-player-box">
              <div className="tfc-iframe-container">
                {selectedVideo ? (
                  <iframe
                    src={`${selectedVideo.embedUrl}?autoplay=1&rel=0`}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : ytInfo?.id ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/videoseries?list=${ytInfo.id}`}
                    title="Contest Recordings Playlist"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                    No video selected
                  </div>
                )}
              </div>

              <div className="tfc-player-footer">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 700, margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selectedVideo?.title || "Contest Recording"}
                  </h3>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
                    {selectedVideo?.duration && (
                      <span style={{ fontWeight: 600, color: "var(--primary)" }}>⏱ {selectedVideo.duration}</span>
                    )}
                    {selectedVideo?.publishedAt && (
                      <span>Uploaded: {new Date(selectedVideo.publishedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <button
                  className="danger sm"
                  onClick={() => openReportModal(selectedVideo)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "#ef4444",
                    borderColor: "rgba(239, 68, 68, 0.3)",
                    fontWeight: 700,
                    boxShadow: "none",
                  }}
                >
                  <span>Report Anonymously 🚩</span>
                  {selectedVideo?.reportCount > 0 && (
                    <span style={{
                      background: "#dc2626",
                      color: "#ffffff",
                      padding: "1px 6px",
                      fontSize: 11,
                      borderRadius: 999,
                      fontWeight: 800,
                      marginLeft: 4,
                    }}>
                      {selectedVideo.reportCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Video Directory Playlist */}
          <div className="tfc-playlist-panel">
            <div className="tfc-playlist-header">
              <div>
                <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                  Contest Recordings ({videos.length})
                </strong>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Click any video to watch in player
                </div>
              </div>
            </div>

            <div className="tfc-playlist-items">
              {videos.map((vid, idx) => {
                const isCurrent = selectedVideo?.videoId === vid.videoId;
                const hasReports = (vid.reportCount || 0) > 0;
                return (
                  <div
                    key={vid.videoId || idx}
                    className={`tfc-video-card-item ${isCurrent ? "active" : ""}`}
                    onClick={() => setSelectedVideo(vid)}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="tfc-video-thumb"
                        onError={(e) => { e.target.src = "https://placehold.co/120x80/1e293b/ffffff?text=TFC"; }}
                      />
                      {vid.duration && (
                        <span style={{
                          position: "absolute",
                          bottom: 3,
                          right: 4,
                          background: "rgba(0, 0, 0, 0.8)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: 3,
                          lineHeight: 1.2,
                        }}>
                          {vid.duration}
                        </span>
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isCurrent ? "var(--primary)" : "var(--text-primary)",
                        lineHeight: 1.3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>
                        {vid.title}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: isCurrent ? "var(--primary)" : "var(--text-muted)", fontWeight: isCurrent ? 600 : 400 }}>
                          {isCurrent ? "▶ Playing Now" : `Recording #${idx + 1}`}
                        </span>
                        <button
                          type="button"
                          className="tfc-flag-btn"
                          title={hasReports ? `${vid.reportCount} report(s) submitted for this video` : "Report this video anonymously"}
                          onClick={(e) => {
                            e.stopPropagation();
                            openReportModal(vid);
                          }}
                        >
                          <span>🚩</span>
                          {hasReports && (
                            <span className="tfc-flag-badge">
                              {vid.reportCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ANONYMOUS VIDEO REPORT MODAL
          ════════════════════════════════════════════════════════════════════ */}
      {reportModalOpen && (
        <div className="modal-overlay" onClick={() => setReportModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Report Video Anonymously</h2>
                <p className="card-subtitle" style={{ margin: "2px 0 0" }}>
                  Your identity is completely hidden. This report goes directly to admins for verification.
                </p>
              </div>
              <button className="modal-close" onClick={() => setReportModalOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              {reportDone ? (
                <div style={{ textAlign: "center", padding: "24px 16px 12px" }}>
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: "50%",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "2.5px solid #10b981",
                      color: "#10b981",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 30,
                      fontWeight: 800,
                      marginBottom: 14,
                    }}
                  >
                    ✓
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: "#10b981", margin: "0 0 6px" }}>
                    Report Submitted
                  </h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
                    Thank you for keeping contests fair. Admins have received this anonymous report and will investigate the recording.
                  </p>
                  <button className="primary" onClick={() => setReportModalOpen(false)}>Close</button>
                </div>
              ) : (
                <form onSubmit={handleReportSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {reportError && <div className="notice error">{reportError}</div>}

                  {/* Pre-filled Details Box */}
                  <div style={{ padding: "10px 14px", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Reported Contestant:</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                      {participant.name} <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>(Roll: {participant.roll})</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Target Video:</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--primary)" }}>
                      {targetVideo?.title || "Contest Recording"}
                    </div>
                  </div>

                  <div className="field">
                    <label>Category of Issue *</label>
                    <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}>
                      <option value="Screen Recording Irregularity">Screen Recording Irregularity</option>
                      <option value="Multiple Monitors / Unauthorized Windows">Multiple Monitors / Unauthorized Windows</option>
                      <option value="Audio Missing / Microphones Muted">Audio Missing / Microphones Muted</option>
                      <option value="Suspicious Code Copying / Plagiarism">Suspicious Code Copying / Plagiarism</option>
                      <option value="Other Policy Violation">Other Policy Violation</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Explanation &amp; Timestamps *</label>
                    <textarea
                      rows={4}
                      value={reportExplanation}
                      onChange={(e) => setReportExplanation(e.target.value)}
                      placeholder="Please specify timestamps and explain what happened (e.g. 'At 34:20, external tab was opened...')"
                      required
                    />
                  </div>

                  <div className="modal-footer" style={{ padding: 0, marginTop: 8 }}>
                    <button type="button" className="secondary" onClick={() => setReportModalOpen(false)}>Cancel</button>
                    <button type="submit" className="danger" disabled={reportLoading}>
                      {reportLoading ? "Submitting…" : "Submit Anonymous Report 🚩"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TfcVideoViewer;
