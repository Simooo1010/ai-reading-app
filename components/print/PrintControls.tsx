"use client";

// The print options (SPEC.md §7.4 "Customization"): screen only, never printed.
// Built from the design-system checklist: tokens only, serif, hairlines,
// 44px tap targets, visible focus, short B1 labels.

import { useId, useState } from "react";
import {
  FONT_LABELS,
  FORMAT_LABELS,
  LIMITS,
  PRINT_FONTS,
  PRINT_FORMATS,
  type PrintFont,
  type PrintFormat,
  type PrintSettings,
} from "@/lib/print/settings";

function NumberControl({
  label,
  unit,
  value,
  min,
  max,
  step,
  decimals,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  // While typing, the field may hold a value that is not valid yet ("", "3.").
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.toFixed(decimals);
  const parse = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const invalid = draft !== null && parse(draft) === null;
  return (
    <div className="rr-print-field">
      <label className="rr-print-field__label" id={labelId} htmlFor={`${id}-n`}>
        {label} <span className="rr-print-field__unit">({unit})</span>
      </label>
      <div className="rr-print-field__row">
        <input
          className="rr-print-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-labelledby={labelId}
          aria-valuetext={`${value.toFixed(decimals)} ${unit}`}
          onChange={(e) => {
            setDraft(null);
            onChange(Number(e.target.value));
          }}
        />
        <input
          id={`${id}-n`}
          className="rr-input rr-print-number"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={shown}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? hintId : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const n = parse(v);
            if (n !== null) onChange(n);
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      {invalid ? (
        <p className="rr-field__error" id={hintId} role="alert">
          Enter a number from {min} to {max}.
        </p>
      ) : null}
    </div>
  );
}

export function PrintControls({
  settings,
  onChange,
  onReset,
  hasEmbeds,
}: {
  settings: PrintSettings;
  onChange: (patch: Partial<PrintSettings>) => void;
  onReset: () => void;
  hasEmbeds: boolean;
}) {
  const id = useId();
  return (
    <section className="rr-section rr-print-controls" aria-labelledby={`${id}-h`}>
      <div className="rr-section__head">
        <h2 className="rr-label" id={`${id}-h`}>
          Print options
        </h2>
        <button type="button" className="rr-btn rr-btn--link rr-section__action" onClick={onReset}>
          Reset
        </button>
      </div>

      <fieldset className="rr-print-seg">
        <legend className="rr-print-field__label">Format</legend>
        <div className="rr-print-seg__options">
          {PRINT_FORMATS.map((f: PrintFormat) => (
            <label key={f} className="rr-print-seg__option">
              <input
                type="radio"
                name={`${id}-format`}
                value={f}
                checked={settings.format === f}
                onChange={() => onChange({ format: f })}
              />
              <span>{FORMAT_LABELS[f]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rr-print-field">
        <label className="rr-print-field__label" htmlFor={`${id}-font`}>
          Font
        </label>
        <select
          id={`${id}-font`}
          className="rr-print-select"
          value={settings.font}
          onChange={(e) => onChange({ font: e.target.value as PrintFont })}
        >
          {PRINT_FONTS.map((f) => (
            <option key={f} value={f}>
              {FONT_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      <NumberControl
        label="Text size"
        unit="pt"
        value={settings.size}
        min={LIMITS.size.min}
        max={LIMITS.size.max}
        step={LIMITS.size.step}
        decimals={0}
        onChange={(n) => onChange({ size: Math.round(n) })}
      />
      <NumberControl
        label="Line spacing"
        unit="lines"
        value={settings.lineSpacing}
        min={LIMITS.lineSpacing.min}
        max={LIMITS.lineSpacing.max}
        step={LIMITS.lineSpacing.step}
        decimals={1}
        onChange={(n) => onChange({ lineSpacing: Math.round(n * 10) / 10 })}
      />
      <NumberControl
        label="Margin"
        unit="mm"
        value={settings.margin}
        min={LIMITS.margin.min}
        max={LIMITS.margin.max}
        step={LIMITS.margin.step}
        decimals={0}
        onChange={(n) => onChange({ margin: Math.round(n) })}
      />

      <label className="rr-print-checkbox">
        <input
          type="checkbox"
          checked={settings.excludeEmbeds}
          onChange={(e) => onChange({ excludeEmbeds: e.target.checked })}
        />
        <span>
          Leave out videos and embeds
          {!hasEmbeds ? <span className="rr-print-checkbox__note"> (this page has none)</span> : null}
        </span>
      </label>
    </section>
  );
}
