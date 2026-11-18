// Every tuning number, colour and story line in one place. The game is a top-down
// open-world crime game set in Palm City, a palm-lined coastal city of our own
// invention: nothing here is from any commercial game. The playfield is a fixed
// 1280x800 logical canvas; the camera scrolls a 4000x3000 world under it.

export const VIEW = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 4000, height: 3000 };

/** Road centrelines. Vertical roads run the full height, horizontal ones the full width. */
export const ROADS_V = [360, 960, 1560, 2160, 2760, 3360];
export const ROADS_H = [360, 860, 1360, 1860, 2360];
export const ROAD_W = 110;
export const LANE = 28;

/** Beach and water on the east edge: sand, then water you cannot enter. */
export const BEACH = { sandX: 3720, waterX: 3840 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  sprintMul: 1.55,
  health: 100,
  armourMax: 100,
};

export const PISTOL = {
  damage: 34,
  fireInterval: 0.22,
  bulletSpeed: 920,
  range: 540,
  magSize: 12,
  reloadTime: 0.9,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 340,
  brake: 620,
  reverseMax: 170,
  maxSpeed: 520,
  sportMaxSpeed: 640,
  steerRate: 2.7,
  health: 100,
};

export const TRAFFIC = { count: 14, speed: 150, speedJitter: 40 };
export const PARKED = { count: 12 };
export const PEDS = { count: 22, walkSpeed: 62, fleeSpeed: 265 };

export const POLICE = {
  maxCars: 4,
  carSpeed: 560,
  chaseRange: 1400,
  /** Seconds a foot cop must stay next to a slow on-foot player before the bust. */
  bustTime: 1.6,
  bustRange: 58,
  shootRange: 330,
  shootInterval: 1.25,
};

export const WANTED = {
  max: 5,
  /** Seconds with no police car within range before a star decays. */
  decaySeconds: 12,
  decayRange: 620,
  sprayCost: 200,
};

export const SAVE_KEY = 'palm-city-heat.save.v1';

export const MISSIONS = [
  {
    name: 'First Run',
    briefing: "Mara Voss: Welcome to Palm City, kid. Pick up the package at the docks and bring it across town. Don't keep me waiting.",
    reward: 300,
    objectives: [
      { kind: 'goto', x: 330, y: 2680, r: 70, text: 'Pick up the package at the DOCKS' },
      { kind: 'goto', x: 3300, y: 330, r: 70, text: 'Deliver the package across town' },
    ],
  },
  {
    name: 'Hot Wheels',
    briefing: "Mara Voss: A client wants the gold Comet GT parked near Coral Row. Steal it, bring it to my garage. You have 90 seconds.",
    reward: 500,
    timer: 90,
    objectives: [
      { kind: 'steal', x: 2790, y: 1290, r: 90, text: 'Steal the gold Comet GT' },
      { kind: 'goto', x: 1560, y: 2360, r: 90, text: 'Deliver the Comet GT to the garage' },
    ],
  },
  {
    name: 'Loud Message',
    briefing: "Mara Voss: The Coral Kings think they own the depot. Pop three of their crates, then lie low at the safehouse.",
    reward: 600,
    objectives: [
      { kind: 'shoot', x: 600, y: 1900, r: 130, count: 3, text: 'Shoot out the crates at the rival depot (0/3)' },
      { kind: 'goto', x: 3360, y: 360, r: 80, text: 'Reach the safehouse' },
    ],
  },
  {
    name: 'The Pickup',
    briefing: "Mara Voss: My driver is stuck at the airstrip and the cops are sniffing around. Pick him up, get him to the marina. Heat is on you the whole drive.",
    reward: 800,
    objectives: [
      { kind: 'goto', x: 2400, y: 2900, r: 80, text: "Pick up Mara's driver at the airstrip" },
      { kind: 'goto', x: 3800, y: 1500, r: 90, text: 'Drive the driver to the marina' },
    ],
  },
  {
    name: 'Last Job',
    briefing: "Mara Voss: Three cash bags stashed around the city, one boat waiting at the marina. Grab them all and be on that boat in 3 minutes. Then we disappear.",
    reward: 1500,
    timer: 180,
    objectives: [
      { kind: 'collect', x: 960, y: 360, r: 70, count: 3, text: 'Collect the cash bags (0/3)' },
      { kind: 'goto', x: 3800, y: 1500, r: 90, text: 'Reach the boat at the marina' },
    ],
  },
];

export const PALETTE = {
  backdrop: '#0e2a33',
  water: '#1f8f96',
  waterDeep: '#157a86',
  sand: '#e9d6a4',
  grass: '#b9c48a',
  block: '#d9cfba',
  blockAlt: '#cfc3ab',
  road: '#3d414c',
  roadEdge: '#333743',
  sidewalk: '#c9bfA6',
  dash: '#f2d06b',
  crosswalk: '#e8e6da',
  building: ['#e8a08c', '#f2d8a0', '#a8c8c0', '#e8c8d8', '#c8b8e8', '#f0e6cc', '#a8c8e8', '#d8b090'],
  buildingEdge: '#00000033',
  roof: '#00000022',
  palmTrunk: '#8a6a4a',
  palmLeaf: '#3f9a4a',
  palmLeafDark: '#2f7a3a',
  player: '#ff5a3c',
  playerDark: '#c23a22',
  ped: ['#4a7ab8', '#b84a7a', '#4ab87a', '#b8a04a', '#7a4ab8', '#c86a3a'],
  cash: '#37c978',
  health: '#ff5a6e',
  armour: '#4aa8ff',
  ammo: '#f2c94c',
  star: '#ffd94a',
  police: '#1c2733',
  policeWhite: '#f2f2ee',
  taxi: '#f2c230',
  text: '#fff8ea',
  muted: '#d8d0bc',
  panel: '#14242bcc',
  gold: '#ffd94a',
  danger: '#ff5a4a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
