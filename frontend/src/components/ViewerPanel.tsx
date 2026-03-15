import { useCallback, useEffect, useRef, useState } from "react";
import type { I18nCopy } from "../i18n/copy";
import type {
  ControlsState,
  ModelState,
  PerformanceStats,
} from "../lib/viewerTypes";
import { CesiumCanvas } from "./CesiumCanvas";
import { SceneCanvas } from "./SceneCanvas";

type ViewerPanelProps = {
  copy: I18nCopy;
  controls: ControlsState;
  perfStats: PerformanceStats;
  formatNumber: Intl.NumberFormat;
  model: ModelState | null;
  fitSignal: number;
  focusSignal: number;
  resetSignal: number;
  onPerfUpdate: (stats: PerformanceStats) => void;
  onReframe: () => void;
  onFocusSatellite: () => void;
  onToggleTrackSatellite: () => void;
  onToggleOrbitPath: () => void;
  onResetCamera: () => void;
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
  focusSignal,
  resetSignal,
  onPerfUpdate,
  onReframe,
  onFocusSatellite,
  onToggleTrackSatellite,
  onToggleOrbitPath,
  onResetCamera,
  onToggleLanguage,
  languageToggleLabel,
}: ViewerPanelProps) {
  const isCesium = controls.renderEngine === "cesium";
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const syncFullscreenState = useCallback(() => {
    if (typeof document === "undefined") return;
    const viewport = viewportRef.current;
    const fullscreenElement = document.fullscreenElement;
    if (!viewport || !fullscreenElement) {
      setIsFullscreen(false);
      return;
    }
    setIsFullscreen(fullscreenElement === viewport || viewport.contains(fullscreenElement));
  }, []);

  useEffect(() => {
    syncFullscreenState();

    const handleFullscreenChange = () => {
      syncFullscreenState();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [syncFullscreenState]);

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fullscreenElement = document.fullscreenElement;
    const isViewportFullscreen =
      fullscreenElement === viewport || (fullscreenElement ? viewport.contains(fullscreenElement) : false);

    try {
      if (isViewportFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await viewport.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Fullscreen can fail when blocked by platform/window manager.
    }
  }, []);

  return (
    <main className="viewer-panel">
      <div className="viewer-header">
        <div>
          <h2>{copy.viewerTitle}</h2>
          {isCesium ? (
            <p className="muted">
              {copy.satelliteModes[controls.satelliteMode]} {"\u00b7"} {copy.timeMultiplier}: ×
              {formatNumber.format(controls.timeMultiplier)}
            </p>
          ) : (
            <p className="muted">
              {copy.perfFps}: {formatNumber.format(perfStats.fps)} {"\u00b7"}{" "}
              {copy.perfFrame}: {formatNumber.format(perfStats.frameMs)} ms {"\u00b7"}{" "}
              {copy.perfGpu}:{" "}
              {perfStats.gpuMs === null
                ? "--"
                : formatNumber.format(perfStats.gpuMs)}{" "}
              ms
            </p>
          )}
        </div>
        <div className="viewer-actions">
          {isCesium ? (
            <>
              <button className="button" type="button" onClick={onFocusSatellite}>
                {copy.focusSatellite}
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={onToggleTrackSatellite}
                disabled={!model?.cesiumUrl}
              >
                {copy.trackSatellite}
              </button>
              <button
                className={`button${controls.showOrbitPath ? " button--primary" : ""}`}
                type="button"
                onClick={onToggleOrbitPath}
              >
                {controls.showOrbitPath
                  ? copy.hideOrbitPath
                  : copy.showOrbitPath}
              </button>
              <button className="button" type="button" onClick={onResetCamera}>
                {copy.resetCamera}
              </button>
              <button className="button" type="button" onClick={() => void handleToggleFullscreen()}>
                {isFullscreen ? copy.exitFullscreen : copy.enterFullscreen}
              </button>
            </>
          ) : (
            <button className="button" type="button" onClick={onReframe}>
              {copy.reframe}
            </button>
          )}
          <button
            className="button button--ghost"
            type="button"
            onClick={onToggleLanguage}
          >
            {languageToggleLabel}
          </button>
        </div>
      </div>
      <div className="scene-frame" ref={isCesium ? viewportRef : null}>
        {isCesium ? (
          <>
            <CesiumCanvas
              model={model}
              controls={controls}
              focusSignal={focusSignal}
              resetSignal={resetSignal}
            />
            {!model?.cesiumUrl && (
              <div className="scene-empty-banner">{copy.cesiumNoModel}</div>
            )}
          </>
        ) : (
          <SceneCanvas
            model={model}
            controls={controls}
            fitSignal={fitSignal}
            onPerfUpdate={onPerfUpdate}
          />
        )}
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
