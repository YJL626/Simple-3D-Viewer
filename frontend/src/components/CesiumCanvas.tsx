import { useCallback, useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import type { ControlsState, ModelState } from "../lib/viewerTypes";

type CesiumCanvasProps = {
  model: ModelState | null;
  controls: ControlsState;
  focusSignal: number;
  resetSignal: number;
};

type PositionConfig = {
  mode: ControlsState["satelliteMode"];
  rightAscensionHours: number;
  declinationDeg: number;
  altitudeKm: number;
  satrec: SatRec | null;
  tleEpochDate: Date | null;
};

const EARTH_RADIUS_METERS = 6_378_137;
const DEFAULT_CAMERA_DESTINATION = Cesium.Cartesian3.fromDegrees(105, 25, 22_000_000);
const DEFAULT_CAMERA_ORIENTATION = {
  heading: 0,
  pitch: Cesium.Math.toRadians(-55),
  roll: 0,
};
const FOCUS_CAMERA_OFFSET = new Cesium.HeadingPitchRange(
  0,
  Cesium.Math.toRadians(-35),
  1_200_000
);
const ORBIT_SEGMENTS = 180;
const ORBIT_MIN_SPAN_SECONDS = 30 * 60;
const ORBIT_MAX_SPAN_SECONDS = 24 * 60 * 60;
const ORBIT_DEFAULT_SPAN_SECONDS = 90 * 60;
const ORBIT_UPDATE_INTERVAL_MS = 1_500;
const ORBIT_COLOR = Cesium.Color.fromCssColorString("#f2cc8f").withAlpha(0.95);
const ARCGIS_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const TLE_EPOCH_YEAR_PIVOT = 57;
const MILLISECONDS_PER_DAY = 86_400_000;
const GLTF_Y_UP_TO_ENU_Z_UP = Cesium.Matrix4.fromRotationTranslation(
  Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(90))
);

function parseSatrec(line1: string, line2: string) {
  const first = line1.trim();
  const second = line2.trim();
  if (!first || !second) return null;
  try {
    const satrec = twoline2satrec(first, second);
    if (satrec.error !== 0) return null;
    if (!Number.isFinite(satrec.no)) return null;
    return satrec;
  } catch {
    return null;
  }
}

function parseTleEpochDate(line1: string) {
  const epochToken = line1.trim().split(/\s+/)[3];
  if (!epochToken) return null;
  const match = /^(\d{2})(\d{3}(?:\.\d+)?)$/.exec(epochToken);
  if (!match) return null;

  const twoDigitYear = Number(match[1]);
  const dayOfYear = Number(match[2]);
  if (!Number.isFinite(dayOfYear) || dayOfYear <= 0) return null;

  const year =
    twoDigitYear >= TLE_EPOCH_YEAR_PIVOT
      ? 1900 + twoDigitYear
      : 2000 + twoDigitYear;
  const wholeDays = Math.floor(dayOfYear);
  const fractionalDay = dayOfYear - wholeDays;
  const startOfYearUtc = Date.UTC(year, 0, 1);
  return new Date(
    startOfYearUtc + (wholeDays - 1) * MILLISECONDS_PER_DAY + fractionalDay * MILLISECONDS_PER_DAY
  );
}

function formatClockLabel(date: Date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function buildPositionConfig(controls: ControlsState): PositionConfig {
  return {
    mode: controls.satelliteMode,
    rightAscensionHours: controls.rightAscensionHours,
    declinationDeg: controls.declinationDeg,
    altitudeKm: controls.altitudeKm,
    satrec: parseSatrec(controls.tleLine1, controls.tleLine2),
    tleEpochDate: parseTleEpochDate(controls.tleLine1),
  };
}

function getClockStartDate(config: PositionConfig) {
  if (config.mode === "tle") {
    return config.tleEpochDate;
  }
  return new Date();
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function getGmstRadians(date: Date) {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const centuries = (julianDay - 2_451_545) / 36_525;
  const gmstDegrees =
    280.46061837 +
    360.98564736629 * (julianDay - 2_451_545) +
    0.000387933 * centuries * centuries -
    (centuries * centuries * centuries) / 38_710_000;
  return Cesium.Math.toRadians(normalizeDegrees(gmstDegrees));
}

function fixedPositionFromRaDec(
  rightAscensionHours: number,
  declinationDeg: number,
  altitudeKm: number
) {
  const radius = EARTH_RADIUS_METERS + altitudeKm * 1_000;
  const rightAscension = Cesium.Math.toRadians(rightAscensionHours * 15);
  const declination = Cesium.Math.toRadians(declinationDeg);

  const cosDec = Math.cos(declination);
  return {
    x: radius * cosDec * Math.cos(rightAscension),
    y: radius * cosDec * Math.sin(rightAscension),
    z: radius * Math.sin(declination),
  };
}

function fixedPositionToCartesian(
  rightAscensionHours: number,
  declinationDeg: number,
  altitudeKm: number,
  date: Date
) {
  const eci = fixedPositionFromRaDec(rightAscensionHours, declinationDeg, altitudeKm);
  const gmst = getGmstRadians(date);
  const cosGmst = Math.cos(gmst);
  const sinGmst = Math.sin(gmst);
  return new Cesium.Cartesian3(
    cosGmst * eci.x + sinGmst * eci.y,
    -sinGmst * eci.x + cosGmst * eci.y,
    eci.z
  );
}

function tlePositionToCartesian(satrec: SatRec | null, date: Date) {
  if (!satrec) return null;
  const positionAndVelocity = propagate(satrec, date);
  const position = positionAndVelocity?.position;
  if (!position) return null;
  const gmst = gstime(date);
  const geodetic = eciToGeodetic(position, gmst);
  if (!Number.isFinite(geodetic.latitude) || !Number.isFinite(geodetic.longitude)) {
    return null;
  }
  return Cesium.Cartesian3.fromRadians(
    geodetic.longitude,
    geodetic.latitude,
    geodetic.height * 1_000
  );
}

function computeSatellitePosition(config: PositionConfig, date: Date) {
  if (config.mode === "tle") {
    const tleCartesian = tlePositionToCartesian(config.satrec, date);
    if (tleCartesian) return tleCartesian;
  }
  return fixedPositionToCartesian(
    config.rightAscensionHours,
    config.declinationDeg,
    config.altitudeKm,
    date
  );
}

function getModelMatrixForPosition(
  position: Cesium.Cartesian3,
  verticalToGround: boolean
) {
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  if (!verticalToGround) return enuMatrix;
  return Cesium.Matrix4.multiply(
    enuMatrix,
    GLTF_Y_UP_TO_ENU_Z_UP,
    new Cesium.Matrix4()
  );
}

function getOrbitSpanSeconds(config: PositionConfig) {
  if (
    config.mode === "tle" &&
    config.satrec &&
    Number.isFinite(config.satrec.no) &&
    config.satrec.no > 0
  ) {
    const periodSeconds = ((Math.PI * 2) / config.satrec.no) * 60;
    return Cesium.Math.clamp(
      periodSeconds * 1.1,
      ORBIT_MIN_SPAN_SECONDS,
      ORBIT_MAX_SPAN_SECONDS
    );
  }
  return ORBIT_DEFAULT_SPAN_SECONDS;
}

function buildOrbitPathPositions(config: PositionConfig, centerDate: Date) {
  const spanSeconds = getOrbitSpanSeconds(config);
  const halfSpanMs = (spanSeconds * 1_000) / 2;
  const positions: Cesium.Cartesian3[] = [];
  for (let index = 0; index < ORBIT_SEGMENTS; index += 1) {
    const ratio = index / (ORBIT_SEGMENTS - 1);
    const sampleDate = new Date(
      centerDate.getTime() - halfSpanMs + spanSeconds * 1_000 * ratio
    );
    positions.push(computeSatellitePosition(config, sampleDate));
  }
  return positions;
}

async function applyEarthImagery(viewer: Cesium.Viewer, cancelled: () => boolean) {
  try {
    const arcgisImagery = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      ARCGIS_IMAGERY_URL
    );
    if (cancelled()) return;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(arcgisImagery);
    return;
  } catch (error) {
    console.warn("Failed to load ArcGIS World Imagery, falling back to OSM.", error);
  }

  try {
    if (cancelled()) return;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      })
    );
    return;
  } catch (error) {
    console.warn("Failed to load OSM imagery, falling back to local NaturalEarthII.", error);
  }

  try {
    const naturalEarth = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
    );
    if (cancelled()) return;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(naturalEarth);
  } catch (error) {
    console.error("Failed to load any globe imagery layer.", error);
  }
}

export function CesiumCanvas({
  model,
  controls,
  focusSignal,
  resetSignal,
}: CesiumCanvasProps) {
  const [clockStartLabel, setClockStartLabel] = useState("--");
  const [clockCurrentLabel, setClockCurrentLabel] = useState("--");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const modelRef = useRef<Cesium.Model | null>(null);
  const trackedEntityRef = useRef<Cesium.Entity | null>(null);
  const orbitEntityRef = useRef<Cesium.Entity | null>(null);
  const orbitPositionsRef = useRef<Cesium.Cartesian3[]>([]);
  const showOrbitPathRef = useRef(controls.showOrbitPath);
  const orbitNeedsRefreshRef = useRef(true);
  const lastOrbitRefreshRef = useRef(0);
  const lastPositionRef = useRef(Cesium.Cartesian3.fromDegrees(0, 0, 600_000));
  const satelliteVerticalToGroundRef = useRef(controls.satelliteVerticalToGround);
  const lastCurrentClockLabelRef = useRef("");
  const syncAnimationStateRef = useRef<() => void>(() => {});
  const positionConfigRef = useRef<PositionConfig>(buildPositionConfig(controls));
  const clockAnchorKey =
    controls.satelliteMode === "tle" ? controls.tleLine1.trim() : controls.satelliteMode;
  const startTimeLabel = controls.language === "zh" ? "开始时间" : "Start time";
  const currentTimeLabel = controls.language === "zh" ? "当前时间" : "Current time";

  const applyDefaultCamera = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: DEFAULT_CAMERA_DESTINATION,
      orientation: DEFAULT_CAMERA_ORIENTATION,
      duration: 1,
    });
  }, []);

  const clearModelPrimitive = useCallback(() => {
    const viewer = viewerRef.current;
    const primitive = modelRef.current;
    if (!viewer || !primitive) return;
    viewer.scene.primitives.remove(primitive);
    if (!primitive.isDestroyed()) {
      primitive.destroy();
    }
    if (viewer.trackedEntity === trackedEntityRef.current) {
      viewer.trackedEntity = undefined;
    }
    modelRef.current = null;
  }, []);

  const applyClockStartTime = useCallback(
    (viewer: Cesium.Viewer, config: PositionConfig) => {
      const startDate = getClockStartDate(config);
      if (!startDate) {
        setClockStartLabel("--");
        return false;
      }
      const startTime = Cesium.JulianDate.fromDate(startDate);
      viewer.clock.startTime = Cesium.JulianDate.clone(startTime, viewer.clock.startTime);
      viewer.clock.currentTime = Cesium.JulianDate.clone(startTime, viewer.clock.currentTime);
      viewer.clock.shouldAnimate = true;

      const label = formatClockLabel(startDate);
      lastCurrentClockLabelRef.current = label;
      setClockStartLabel(label);
      setClockCurrentLabel(label);
      return true;
    },
    []
  );

  const syncAnimationState = useCallback(() => {
    const primitive = modelRef.current;
    if (!primitive || !primitive.ready) return;
    const activeAnimations = primitive.activeAnimations;
    activeAnimations.removeAll();
    if (!controls.animationPlay || controls.animationClip === "none") {
      return;
    }
    try {
      if (controls.animationClip === "__all__") {
        activeAnimations.addAll({
          multiplier: controls.animationSpeed,
          loop: Cesium.ModelAnimationLoop.REPEAT,
        });
        return;
      }
      activeAnimations.add({
        name: controls.animationClip,
        multiplier: controls.animationSpeed,
        loop: Cesium.ModelAnimationLoop.REPEAT,
      });
    } catch (error) {
      console.warn("Failed to play Cesium animation action", error);
    }
  }, [controls.animationClip, controls.animationPlay, controls.animationSpeed]);

  useEffect(() => {
    positionConfigRef.current = buildPositionConfig(controls);
    orbitNeedsRefreshRef.current = true;
  }, [
    controls.satelliteMode,
    controls.rightAscensionHours,
    controls.declinationDeg,
    controls.altitudeKm,
    controls.tleLine1,
    controls.tleLine2,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const applied = applyClockStartTime(viewer, positionConfigRef.current);
    if (!applied) return;
    orbitNeedsRefreshRef.current = true;
    lastOrbitRefreshRef.current = 0;
  }, [applyClockStartTime, clockAnchorKey]);

  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      baseLayer: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      shouldAnimate: true,
      requestRenderMode: false,
    });
    let isDisposed = false;
    void applyEarthImagery(viewer, () => isDisposed);
    viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    applyClockStartTime(viewer, positionConfigRef.current);
    viewer.clock.multiplier = controls.timeMultiplier;
    viewer.scene.globe.enableLighting = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewerRef.current = viewer;
    const trackedEntity = viewer.entities.add({
      id: "satellite-track-target",
      position: new Cesium.CallbackPositionProperty(
        (_time, result) => Cesium.Cartesian3.clone(lastPositionRef.current, result),
        false
      ),
      point: {
        pixelSize: 1,
        color: Cesium.Color.TRANSPARENT,
      },
    });
    trackedEntityRef.current = trackedEntity;
    const orbitEntity = viewer.entities.add({
      id: "satellite-orbit-path",
      show: controls.showOrbitPath,
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => orbitPositionsRef.current,
          false
        ),
        width: 2.2,
        material: ORBIT_COLOR,
        clampToGround: false,
      },
    });
    orbitEntityRef.current = orbitEntity;
    showOrbitPathRef.current = controls.showOrbitPath;
    const tickHandler = (clock: Cesium.Clock) => {
      const nowDate = Cesium.JulianDate.toDate(clock.currentTime);
      const nowLabel = formatClockLabel(nowDate);
      if (nowLabel !== lastCurrentClockLabelRef.current) {
        lastCurrentClockLabelRef.current = nowLabel;
        setClockCurrentLabel(nowLabel);
      }
      const next = computeSatellitePosition(
        positionConfigRef.current,
        nowDate
      );
      Cesium.Cartesian3.clone(next, lastPositionRef.current);
      const primitive = modelRef.current;
      if (primitive) {
        primitive.modelMatrix = getModelMatrixForPosition(
          lastPositionRef.current,
          satelliteVerticalToGroundRef.current
        );
      }
      if (showOrbitPathRef.current) {
        const orbitPolyline = orbitEntityRef.current?.polyline;
        if (orbitPolyline) {
          const nowMs = performance.now();
          if (
            orbitNeedsRefreshRef.current ||
            nowMs - lastOrbitRefreshRef.current >= ORBIT_UPDATE_INTERVAL_MS
          ) {
            orbitPositionsRef.current = buildOrbitPathPositions(
              positionConfigRef.current,
              nowDate
            );
            orbitNeedsRefreshRef.current = false;
            lastOrbitRefreshRef.current = nowMs;
          }
        }
      }
    };
    viewer.clock.onTick.addEventListener(tickHandler);
    applyDefaultCamera();

    return () => {
      isDisposed = true;
      viewer.clock.onTick.removeEventListener(tickHandler);
      clearModelPrimitive();
      if (trackedEntityRef.current) {
        viewer.entities.remove(trackedEntityRef.current);
        trackedEntityRef.current = null;
      }
      if (orbitEntityRef.current) {
        viewer.entities.remove(orbitEntityRef.current);
        orbitEntityRef.current = null;
      }
      orbitPositionsRef.current = [];
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [applyClockStartTime, applyDefaultCamera, clearModelPrimitive]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.multiplier = controls.timeMultiplier;
  }, [controls.timeMultiplier]);

  useEffect(() => {
    syncAnimationStateRef.current = syncAnimationState;
    syncAnimationState();
  }, [syncAnimationState]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    clearModelPrimitive();
    const modelUrl = model?.cesiumUrl;
    if (!modelUrl) return;

    let cancelled = false;
    const loadPrimitive = async () => {
      try {
        const primitive = await Cesium.Model.fromGltfAsync({
          url: modelUrl,
          minimumPixelSize: 96,
          maximumScale: 28_000,
        });
        if (cancelled) {
          if (!primitive.isDestroyed()) {
            primitive.destroy();
          }
          return;
        }
        primitive.errorEvent.addEventListener((error) => {
          console.error("Cesium model runtime error", error);
        });
        viewer.scene.primitives.add(primitive);
        modelRef.current = primitive;

        const initialPosition = computeSatellitePosition(
          positionConfigRef.current,
          Cesium.JulianDate.toDate(viewer.clock.currentTime)
        );
        Cesium.Cartesian3.clone(initialPosition, lastPositionRef.current);
        primitive.modelMatrix = getModelMatrixForPosition(
          lastPositionRef.current,
          satelliteVerticalToGroundRef.current
        );
        if (primitive.ready) {
          syncAnimationStateRef.current();
          viewer.camera.flyToBoundingSphere(primitive.boundingSphere, {
            duration: 1.2,
            offset: FOCUS_CAMERA_OFFSET,
          });
        } else {
          primitive.readyEvent.addEventListener(() => {
            if (cancelled || primitive !== modelRef.current) return;
            syncAnimationStateRef.current();
            viewer.camera.flyToBoundingSphere(primitive.boundingSphere, {
              duration: 1.2,
              offset: FOCUS_CAMERA_OFFSET,
            });
          });
        }
      } catch (error) {
        console.error("Failed to load Cesium GLB model", error);
      }
    };

    void loadPrimitive();
    return () => {
      cancelled = true;
      clearModelPrimitive();
    };
  }, [clearModelPrimitive, model?.cesiumUrl]);

  useEffect(() => {
    if (focusSignal === 0) return;
    const viewer = viewerRef.current;
    const primitive = modelRef.current;
    if (!viewer || !primitive || !primitive.ready) return;
    viewer.camera.flyToBoundingSphere(primitive.boundingSphere, {
      duration: 1.1,
      offset: FOCUS_CAMERA_OFFSET,
    });
  }, [focusSignal]);

  useEffect(() => {
    if (resetSignal === 0) return;
    applyDefaultCamera();
  }, [applyDefaultCamera, resetSignal]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const trackedEntity = trackedEntityRef.current;
    if (!viewer || !trackedEntity) return;
    if (controls.trackSatellite && model?.cesiumUrl) {
      viewer.trackedEntity = trackedEntity;
      return;
    }
    if (viewer.trackedEntity === trackedEntity) {
      viewer.trackedEntity = undefined;
    }
  }, [controls.trackSatellite, model?.cesiumUrl]);

  useEffect(() => {
    satelliteVerticalToGroundRef.current = controls.satelliteVerticalToGround;
    const primitive = modelRef.current;
    if (!primitive) return;
    primitive.modelMatrix = getModelMatrixForPosition(
      lastPositionRef.current,
      satelliteVerticalToGroundRef.current
    );
  }, [controls.satelliteVerticalToGround]);

  useEffect(() => {
    showOrbitPathRef.current = controls.showOrbitPath;
    const orbitEntity = orbitEntityRef.current;
    if (!orbitEntity) return;
    orbitEntity.show = controls.showOrbitPath;
    if (controls.showOrbitPath) {
      orbitNeedsRefreshRef.current = true;
      lastOrbitRefreshRef.current = 0;
    }
  }, [controls.showOrbitPath]);

  return (
    <div className="cesium-container" ref={containerRef}>
      <div className="cesium-time-overlay">
        <div className="cesium-time-line">
          <span className="cesium-time-key">{startTimeLabel}</span>
          <span>{clockStartLabel}</span>
        </div>
        <div className="cesium-time-line">
          <span className="cesium-time-key">{currentTimeLabel}</span>
          <span>{clockCurrentLabel}</span>
        </div>
      </div>
    </div>
  );
}
