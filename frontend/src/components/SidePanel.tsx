import type { ChangeEvent } from "react";
import { Inspector } from "react-inspector";
import type { I18nCopy } from "../i18n/copy";
import type {
  ControlsState,
  LightPreset,
  ModelState,
  MorphTargetInfo,
  PerformanceHint,
  ViewerMode,
} from "../lib/viewerTypes";

type ViewerModeOption = {
  id: ViewerMode;
  labelKey: keyof I18nCopy["viewerModes"];
};

type LightPresetOption = {
  id: LightPreset;
  labelKey: keyof I18nCopy["lightPresets"];
};

type SidePanelProps = {
  copy: I18nCopy;
  isOnline: boolean;
  loading: boolean;
  error: string | null;
  controls: ControlsState;
  onSetControls: (values: Partial<ControlsState>) => void;
  viewerModes: ViewerModeOption[];
  lightPresets: LightPresetOption[];
  onChooseFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadExample: () => void;
  onLoadMorphExample: () => void;
  onClear: () => void;
  model: ModelState | null;
  modelSizeLabel: string;
  formatNumber: Intl.NumberFormat;
  performanceHint: PerformanceHint;
  morphTargets: MorphTargetInfo[];
  morphValues: Record<string, number>;
  onMorphChange: (name: string, value: number, exclusive?: boolean) => void;
  onMorphReset: () => void;
  supportedFormatsLabel: string;
};

function toSafeJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}

function formatClipboardValue(value: unknown) {
  const safe = toSafeJson(value);
  if (safe === null || safe === undefined) return "";
  if (typeof safe === "string") return safe;
  try {
    return JSON.stringify(safe, null, 2);
  } catch {
    return String(safe);
  }
}

function copyToClipboard(value: unknown) {
  const text = formatClipboardValue(value);
  if (!text) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}


export function SidePanel({
  copy,
  isOnline,
  loading,
  error,
  controls,
  onSetControls,
  viewerModes,
  lightPresets,
  onChooseFile,
  onLoadExample,
  onLoadMorphExample,
  onClear,
  model,
  modelSizeLabel,
  formatNumber,
  performanceHint,
  morphTargets,
  morphValues,
  onMorphChange,
  onMorphReset,
  supportedFormatsLabel,
}: SidePanelProps) {
  const animationList = model?.animations ?? [];
  const animationOptionsList = animationList
    .map((clip) => clip.name)
    .filter((name): name is string => Boolean(name));
  const hasMorphTargets = morphTargets.length > 0;
  const isMorphEmpty = morphTargets.every(
    (target) => (morphValues[target.name] ?? 0) <= 0.001
  );
  const isGltf = model?.format === "gltf" || model?.format === "glb";
  const customSections = model?.customProperties ?? [];

  return (
    <aside className="side-panel">
      <div className="panel-card">
        <div className="brand">
          <div>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
          <span className={`status-pill ${isOnline ? "online" : "offline"}`}>
            {copy.offlineReady} {"\u00b7"} {isOnline ? copy.online : copy.offline}
          </span>
        </div>
      </div>

      <div className="panel-card">
        <h2>{copy.loadTitle}</h2>
        <p className="muted">{copy.dropTitle}</p>
        <p className="muted">{copy.dropHint}</p>
        <div className="button-row">
          <label className="button button--primary">
            {copy.chooseFile}
            <input
              className="file-input"
              type="file"
              accept=".drc,.glb,.gltf,.obj,.ply,.stl,.usd,.usdz"
              multiple
              onChange={onChooseFile}
            />
          </label>
          <button className="button" type="button" onClick={onLoadExample}>
            {copy.loadExample}
          </button>
          <button className="button" type="button" onClick={onLoadMorphExample}>
            {copy.loadMorphExample}
          </button>
        </div>
        <div className="button-row">
          <button className="button button--ghost" type="button" onClick={onClear}>
            {copy.clearModel}
          </button>
        </div>
        <div className="format-list">
          <span className="format-label">{copy.supportedFormats}</span>
          <span className="format-value">{supportedFormatsLabel}</span>
        </div>
        {loading && <div className="loading-chip">{copy.loading}</div>}
        {error && <div className="error-chip">{error}</div>}
      </div>

      <div className="panel-card">
        <h2>{copy.viewerTitle}</h2>
        <div className="segmented">
          {viewerModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`segmented__btn${
                controls.viewerMode === mode.id ? " active" : ""
              }`}
              onClick={() => onSetControls({ viewerMode: mode.id })}
            >
              {copy.viewerModes[mode.labelKey]}
            </button>
          ))}
        </div>
        <div className="toggle-grid">
          <label>
            <input
              type="checkbox"
              checked={controls.showAxes}
              onChange={(event) =>
                onSetControls({ showAxes: event.target.checked })
              }
            />
            {copy.axes}
          </label>
          <label>
            <input
              type="checkbox"
              checked={controls.showGrid}
              onChange={(event) =>
                onSetControls({ showGrid: event.target.checked })
              }
            />
            {copy.grid}
          </label>
          <label>
            <input
              type="checkbox"
              checked={controls.showGizmo}
              onChange={(event) =>
                onSetControls({ showGizmo: event.target.checked })
              }
            />
            {copy.gizmo}
          </label>
          <label>
            <input
              type="checkbox"
              checked={controls.showStats}
              onChange={(event) =>
                onSetControls({ showStats: event.target.checked })
              }
            />
            {copy.stats}
          </label>
          <label>
            <input
              type="checkbox"
              checked={controls.autoRotate}
              onChange={(event) =>
                onSetControls({ autoRotate: event.target.checked })
              }
            />
            {copy.autoRotate}
          </label>
        </div>
        {controls.showAxes && (
          <label className="inline-range">
            <span>{copy.axesSize}</span>
            <input
              type="range"
              min={0.4}
              max={6}
              step={0.1}
              value={controls.axesSize}
              onChange={(event) =>
                onSetControls({ axesSize: Number(event.target.value) })
              }
            />
            <span className="inline-value">{controls.axesSize.toFixed(1)}</span>
          </label>
        )}
        <div className="section-sep" />
        <h3>{copy.lightingTitle}</h3>
        <div className="segmented">
          {lightPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`segmented__btn${
                controls.lightPreset === preset.id ? " active" : ""
              }`}
              onClick={() => onSetControls({ lightPreset: preset.id })}
            >
              {copy.lightPresets[preset.labelKey]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <h2>{copy.animations}</h2>
        {animationList.length === 0 ? (
          <p className="muted">{copy.animationNone}</p>
        ) : (
          <div className="animation-panel">
            <div className="animation-list">
              {animationOptionsList.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chip${
                    controls.animationClip === name ? " active" : ""
                  }`}
                  onClick={() => onSetControls({ animationClip: name })}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="animation-controls">
              <button
                type="button"
                className="button button--ghost"
                onClick={() =>
                  onSetControls({ animationPlay: !controls.animationPlay })
                }
              >
                {controls.animationPlay ? copy.animationPause : copy.animationPlay}
              </button>
              <label className="range">
                <span>{copy.animationSpeed}</span>
                <input
                  type="range"
                  min={0.2}
                  max={2.5}
                  step={0.1}
                  value={controls.animationSpeed}
                  onChange={(event) =>
                    onSetControls({
                      animationSpeed: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="panel-card">
        <h2>{copy.morphTargets}</h2>
        {!hasMorphTargets ? (
          <p className="muted">{copy.morphNone}</p>
        ) : (
          <>
            <p className="muted">{copy.morphQuick}</p>
            <div className="chip-group">
              <button
                type="button"
                className={`chip${isMorphEmpty ? " active" : ""}`}
                onClick={onMorphReset}
              >
                {copy.morphNone}
              </button>
              {morphTargets.map((target) => (
                <button
                  key={target.name}
                  type="button"
                  className={`chip${
                    (morphValues[target.name] ?? 0) >= 0.5 ? " active" : ""
                  }`}
                  onClick={() => onMorphChange(target.name, 1, true)}
                >
                  {target.name}
                </button>
              ))}
            </div>
            <div className="morph-list">
              {morphTargets.map((target) => (
                <div key={target.name} className="morph-row">
                  <label>
                    {target.name}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={morphValues[target.name] ?? 0}
                      onChange={(event) =>
                        onMorphChange(target.name, Number(event.target.value))
                      }
                    />
                  </label>
                  <span className="morph-value">
                    {copy.morphStrength}: {(morphValues[target.name] ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel-card">
        <h2>{copy.modelInfo}</h2>
        <div className="stats-grid">
          <div>
            <span>{copy.fileName}</span>
            <strong>{model?.name ?? copy.noModel}</strong>
          </div>
          <div>
            <span>{copy.format}</span>
            <strong>{model?.format?.toUpperCase() ?? "--"}</strong>
          </div>
          <div>
            <span>{copy.triangles}</span>
            <strong>
              {model ? formatNumber.format(model.stats.triangles) : "--"}
            </strong>
          </div>
          <div>
            <span>{copy.vertices}</span>
            <strong>
              {model ? formatNumber.format(model.stats.vertices) : "--"}
            </strong>
          </div>
          <div>
            <span>{copy.meshes}</span>
            <strong>
              {model ? formatNumber.format(model.stats.meshes) : "--"}
            </strong>
          </div>
          <div>
            <span>{copy.materials}</span>
            <strong>
              {model ? formatNumber.format(model.stats.materials) : "--"}
            </strong>
          </div>
          <div>
            <span>{copy.size}</span>
            <strong>{modelSizeLabel}</strong>
          </div>
        </div>
        <div className={`performance-hint ${performanceHint.level}`}>
          {performanceHint.message}
        </div>
      </div>

      <div className="panel-card">
        <h2>{copy.customProps}</h2>
        {!model ? (
          <p className="muted">{copy.noModel}</p>
        ) : !isGltf ? (
          <p className="muted">{copy.customPropsUnsupported}</p>
        ) : customSections.length === 0 ? (
          <p className="muted">{copy.customPropsEmpty}</p>
        ) : (
          <div className="custom-props">
            {customSections.map((section) => (
              <div key={section.id} className="custom-props__section">
                <div className="custom-props__label-row">
                  <div className="custom-props__label">
                    {copy.customPropsSections[section.id]}
                  </div>
                  <button
                    type="button"
                    className="button button--ghost custom-props__copy"
                    onClick={() => copyToClipboard(section.value)}
                  >
                    {copy.customPropsCopy}
                  </button>
                </div>
                <div className="custom-props__value">
                  <Inspector
                    table={false}
                    data={toSafeJson(section.value)}
                    expandLevel={2}
                    theme="chromeLight"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
