export const MOON_RADIUS_M = 1_737_400;

export const APP_CONFIG = {
  roverVisualYawDeg: 180,
  roverTargetLength: 4.8,

  gravity: 1.62,
  gravityMax: 274.8,
  groundReleaseTolerance: 0.08,
  maxGroundVerticalSpeed: 80,
  accel: 5.5,
  brake: 8.5,
  maxSpeed: 1800,
  reverseMax: 6,
  steerRate: 1.15,

  bodyClearance: 0.06,
  wheelRadius: 0.68,

  // Rig axes
  // WHEEL_* bones were created along the axle, so bone-local Y is the spin axis.
  wheelSpinAxis: 'y',

  // STEER_FL / STEER_FR also rotate around their bone-local Y.
  wheelSteerAxis: 'y',

  // SUSP_* bones are aligned vertically.
  wheelSuspensionAxis: 'y',

  wheelVisualMaxSteerDeg: 24,
  wheelVisualSuspensionTravel: 0.18,
  wheelSuspensionSampleRange: 0.32,

  network: {
    interpolationMs: 120,
    maxPeerSamples: 20
  },

  floatingOriginThreshold: 2500,

  terrain: {
    farRadius: 58_000,
    landingRadius: 4_500,
    tileBuildBudgetMs: 3,
    maxTileBuildsPerFrame: 1,
    splitFactor: 1.25,
    tileRetireMs: 2500,
    sourceSamples: 65,
    renderSegments: [32, 32, 48, 64, 128],
    skirtDepth: [12, 8, 5, 3, 1.5],

    proceduralDetail: {
      maxAmplitude: 0.75,
      mediumAmplitude: 0.28,
      fineAmplitude: 0.08
    }
  },

  camera: {
    distance: 10.5,
    height: 3.6,
    lookAhead: 3.4,
    lookHeight: 1.25,
    collisionClearance: 0.45
  }
};

export const SITES = {
  apollo15: {
    id: 'apollo15',
    hotkey: 'Digit1',
    name: 'APOLLO 15 // HADLEY-APENNINE',
    lat: 26.08,
    lon: 3.66,
    note: 'SLDEM2015 REAL DEM // HADLEY DELTA + HADLEY RILLE',
    roverHeadingDeg: 0
  },

  tycho: {
    id: 'tycho',
    hotkey: 'Digit2',
    name: 'TYCHO CRATER',
    lat: -43.37,
    lon: 348.68,
    note: 'SLDEM2015 REAL DEM // ~82 KM CRATER',
    roverHeadingDeg: 0
  },

  aristarchus: {
    id: 'aristarchus',
    hotkey: 'Digit3',
    name: 'ARISTARCHUS CRATER',
    lat: 23.70,
    lon: 312.60,
    note: 'SLDEM2015 REAL DEM // ~42 KM CRATER',
    roverHeadingDeg: 0
  },

  copernicus: {
    id: 'copernicus',
    hotkey: 'Digit4',
    name: 'COPERNICUS CRATER',
    lat: 9.62,
    lon: 339.92,
    note: 'SLDEM2015 REAL DEM // ~93 KM CRATER',
    roverHeadingDeg: 0
  }
};


export const BOUNDARY_TEST_SITES = {
  seam360: {
    id: 'seam360',
    hotkey: 'F1',
    name: 'TEST // 360° → 0° SEAM',
    lat: 20.0,
    lon: 359.95,
    note: 'BOUNDARY TEST // DRIVE EAST ACROSS 360°/0°',
    roverHeadingDeg: 90
  },
  seam45: {
    id: 'seam45',
    hotkey: 'F2',
    name: 'TEST // 45°E BLOCK EDGE',
    lat: 20.0,
    lon: 44.95,
    note: 'BOUNDARY TEST // DRIVE EAST ACROSS 45°E',
    roverHeadingDeg: 90
  },
  seam90: {
    id: 'seam90',
    hotkey: 'F3',
    name: 'TEST // 90°E BLOCK EDGE',
    lat: 20.0,
    lon: 89.95,
    note: 'BOUNDARY TEST // DRIVE EAST ACROSS 90°E',
    roverHeadingDeg: 90
  },
  seam30N: {
    id: 'seam30N',
    hotkey: 'F4',
    name: 'TEST // 30°N BLOCK EDGE',
    lat: 29.95,
    lon: 10.0,
    note: 'BOUNDARY TEST // DRIVE NORTH ACROSS 30°N',
    roverHeadingDeg: 0
  },
  seamEquator: {
    id: 'seamEquator',
    hotkey: 'F5',
    name: 'TEST // EQUATOR BLOCK EDGE',
    lat: -0.05,
    lon: 10.0,
    note: 'BOUNDARY TEST // DRIVE NORTH ACROSS 0°',
    roverHeadingDeg: 0
  },
  seam30S: {
    id: 'seam30S',
    hotkey: 'F6',
    name: 'TEST // 30°S BLOCK EDGE',
    lat: -29.95,
    lon: 10.0,
    note: 'BOUNDARY TEST // DRIVE SOUTH ACROSS 30°S',
    roverHeadingDeg: 180
  },
  seam60N: {
    id: 'seam60N',
    hotkey: 'F7',
    name: 'TEST // 60°N POLAR PROVIDER EDGE',
    lat: 59.95,
    lon: 10.0,
    note: 'BOUNDARY TEST // DRIVE NORTH INTO LOLA POLAR DEM',
    roverHeadingDeg: 0
  },
  seam60S: {
    id: 'seam60S',
    hotkey: 'F8',
    name: 'TEST // 60°S POLAR PROVIDER EDGE',
    lat: -59.95,
    lon: 10.0,
    note: 'BOUNDARY TEST // DRIVE SOUTH INTO LOLA POLAR DEM',
    roverHeadingDeg: 180
  }
};

export const DEFAULT_SITE_ID = 'apollo15';