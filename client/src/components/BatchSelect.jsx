import React, { useState, useEffect, useRef } from "react";

export const BatchSelect = ({
  value = "",
  onChange,
  options = [],
  placeholder = "Select Batch *",
  required = false,
  name,
  id,
  className = "",
  style = {},
}) => {
  const isPreset = Boolean(value && options.includes(value));
  const [isOther, setIsOther] = useState(Boolean(value && !isPreset));
  const [customValue, setCustomValue] = useState(isPreset ? "" : value);
  const inputRef = useRef(null);

  // If a preset value is passed or restored, turn off other mode
  useEffect(() => {
    if (isPreset) {
      setIsOther(false);
      setCustomValue("");
    } else if (value && !isPreset) {
      setIsOther(true);
      setCustomValue(value);
    }
  }, [value, isPreset]);

  // Auto-focus the text input when "Other" is chosen
  useEffect(() => {
    if (isOther && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOther]);

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    if (selected === "__other__") {
      setIsOther(true);
      const initial = customValue || "";
      onChange?.(initial);
    } else {
      setIsOther(false);
      setCustomValue("");
      onChange?.(selected);
    }
  };

  const handleCustomChange = (e) => {
    let raw = e.target.value.trimStart();
    if (/^2k/i.test(raw)) {
      raw = "2K" + raw.slice(2);
    }
    setCustomValue(raw);
    onChange?.(raw);
  };

  const selectValue = isOther ? "__other__" : (options.includes(value) ? value : "");

  return (
    <div className={`batch-select-wrapper ${className}`} style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <select
        id={id}
        name={name}
        value={selectValue}
        onChange={handleSelectChange}
        required={required && !isOther}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__other__">Other</option>
      </select>

      {isOther && (
        <div className="batch-custom-input-wrap">
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter batch (e.g. 2K25)"
            value={customValue}
            onChange={handleCustomChange}
            maxLength={10}
            required={required}
            autoComplete="off"
            style={{ textTransform: "uppercase" }}
          />
        </div>
      )}
    </div>
  );
};

export default BatchSelect;
