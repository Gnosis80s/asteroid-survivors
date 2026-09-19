// Uniform-grid broad-phase for circle collisions.
// Cell size should be >= the largest collider diameter in play.

export class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map(); // "cx,cy" -> array of entity ids
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    return cx + ',' + cy;
  }

  insert(id, x, y, r) {
    const cs = this.cellSize;
    const minX = Math.floor((x - r) / cs);
    const maxX = Math.floor((x + r) / cs);
    const minY = Math.floor((y - r) / cs);
    const maxY = Math.floor((y + r) / cs);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this._key(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(id);
      }
    }
  }

  // Returns a Set of candidate ids overlapping the circle (x,y,r).
  query(x, y, r, out) {
    const cs = this.cellSize;
    const minX = Math.floor((x - r) / cs);
    const maxX = Math.floor((x + r) / cs);
    const minY = Math.floor((y - r) / cs);
    const maxY = Math.floor((y + r) / cs);
    out.clear();
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) out.add(bucket[i]);
        }
      }
    }
    return out;
  }
}
