export class FloatingOrigin {
  constructor(threshold = 2500) {
    this.east = 0;
    this.north = 0;
    this.threshold = threshold;
    this.version = 0;
  }

  reset(east = 0, north = 0) {
    this.east = east;
    this.north = north;
    this.version++;
  }

  update(playerEast, playerNorth) {
    const de = playerEast - this.east;
    const dn = playerNorth - this.north;
    if (Math.hypot(de, dn) < this.threshold) return false;
    this.east = playerEast;
    this.north = playerNorth;
    this.version++;
    return true;
  }
}
