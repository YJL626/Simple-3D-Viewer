import type { I18nCopy } from "../i18n/copy";
import type {
  ControlsState,
  ModelState,
  PerformanceStats,
} from "../lib/viewerTypes";
import { SceneCanvas } from "./SceneCanvas";

type ViewerPanelProps = {
  copy: I18nCopy;
  controls: ControlsState;
  perfStats: PerformanceStats;
  formatNumber: Intl.NumberFormat;
  model: ModelState | null;
  fitSignal: number;
  onPerfUpdate: (stats: PerformanceStats) => void;
  onReframe: () => void;
  onToggleLanguage: () => void;
  languageToggleLabel: string;
};

export function ViewerPanel({
  copy,
  controls,
  perfStats,
  formatNumber,
  model,
  fitSignal,
  onPerfUpdate,
  onReframe,
  onToggleLanguage,
  languageToggleLabel,
}: ViewerPanelProps) {
  return (
    <main className="viewer-panel">
      <div className="viewer-header">
        <div>
          <h2>{copy.viewerTitle}</h2>
          <p className="muted">
            {copy.perfFps}: {formatNumber.format(perfStats.fps)} {"\u00b7"}{" "}
            {copy.perfFrame}: {formatNumber.format(perfStats.frameMs)} ms
          </p>
        </div>
        <div className="viewer-actions">
          <button className="button" type="button" onClick={onReframe}>
            {copy.reframe}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={onToggleLanguage}
          >
            {languageToggleLabel}
          </button>
        </div>
      </div>
      <div className="scene-frame">
        <SceneCanvas
          model={model}
          controls={controls}
          fitSignal={fitSignal}
          onPerfUpdate={onPerfUpdate}
        />
      </div>
      <div className="drop-overlay">
        <div>
          <h3>{copy.dropTitle}</h3>
          <p>{copy.dropHint}</p>
        </div>
      </div>
    </main>
  );
}
