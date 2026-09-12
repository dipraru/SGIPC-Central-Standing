import React, { useState, useEffect, useRef } from "react";

export const BatchFilter = ({
  options = [],
  batches,
  selectedBatches = [],
  onChange,
  placeholder = "Batch",
  style = {},
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const batchList = batches || options || [];

  // Close dropdown when clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleBatch = (batch) => {
    if (!onChange) return;
    if (selectedBatches.includes(batch)) {
      onChange(selectedBatches.filter((b) => b !== batch));
    } else {
      onChange([...selectedBatches, batch]);
    }
  };

  const selectAll = () => {
    if (onChange) onChange([...batchList]);
  };

  const clearAll = () => {
    if (onChange) onChange([]);
  };

  return (
    <div
      ref={containerRef}
      className={`batch-filter-container ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <button
        type="button"
        className={`secondary sm ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
          userSelect: "none",
          background: selectedBatches.length > 0 ? "var(--primary-light, rgba(99, 102, 241, 0.1))" : undefined,
          borderColor: selectedBatches.length > 0 ? "var(--primary)" : undefined,
          color: selectedBatches.length > 0 ? "var(--primary)" : undefined,
        }}
        title="Filter by academic batch"
      >
        <span>🎓 {placeholder}</span>
        {selectedBatches.length > 0 && (
          <span
            style={{
              background: "var(--primary)",
              color: "#ffffff",
              borderRadius: 999,
              padding: "0 6px",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "16px",
              minWidth: 16,
              textAlign: "center",
            }}
          >
            {selectedBatches.length}
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.7, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
          ▼
        </span>
      </button>

      {/* Selected Batch Tags */}
      {selectedBatches.map((b) => (
        <span
          key={b}
          className="batch-tag"
          onClick={() => toggleBatch(b)}
          title={`Remove batch ${b}`}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          {b} <span style={{ marginLeft: 3, fontWeight: 700 }}>×</span>
        </span>
      ))}

      {selectedBatches.length > 0 && (
        <button
          type="button"
          className="secondary sm"
          onClick={clearAll}
          style={{ padding: "3px 8px", fontSize: 11, color: "var(--text-muted)" }}
          title="Clear batch filter"
        >
          Clear
        </button>
      )}

      {/* Dropdown Popup */}
      {isOpen && (
        <div
          className="batch-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            zIndex: 9999,
            background: "var(--bg-card)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg, 10px)",
            boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.2)",
            padding: "10px 12px",
            minWidth: 190,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "2px 4px 6px 4px",
              borderBottom: "1px solid var(--border)",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Filter Batches
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {selectedBatches.length < batchList.length && (
                <button
                  type="button"
                  onClick={selectAll}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11,
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  All
                </button>
              )}
              {selectedBatches.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {batchList.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 6 }}>No batches available</div>
            ) : (
              batchList.map((b) => {
                const isChecked = selectedBatches.includes(b);
                return (
                  <label
                    key={b}
                    className={`batch-checkbox-label ${isChecked ? "selected" : ""}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 8px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: isChecked ? 700 : 500,
                      cursor: "pointer",
                      userSelect: "none",
                      background: isChecked ? "var(--primary-light, rgba(99, 102, 241, 0.1))" : "transparent",
                      color: isChecked ? "var(--primary)" : "var(--text-primary)",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleBatch(b)}
                      style={{
                        width: "auto",
                        accentColor: "var(--primary)",
                        cursor: "pointer",
                        margin: 0,
                      }}
                    />
                    <span>{b}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchFilter;
