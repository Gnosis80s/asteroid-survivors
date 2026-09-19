// Minimal, allocation-conscious Entity-Component-System.
//
// - Entities are integer IDs (recycled via a free list to avoid GC churn).
// - Components are stored as Map<componentName, Map<entityId, data>>.
// - query(...names) returns an array of entity ids that own every named
//   component, iterating the smallest set for speed.

export class World {
  constructor() {
    this.nextId = 1;
    this.free = [];
    this.stores = new Map(); // name -> Map<id, component>
  }

  create() {
    return this.free.length ? this.free.pop() : this.nextId++;
  }

  destroy(id) {
    for (const store of this.stores.values()) store.delete(id);
    this.free.push(id);
  }

  add(id, name, data) {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    store.set(id, data);
    return data;
  }

  get(id, name) {
    const store = this.stores.get(name);
    return store ? store.get(id) : undefined;
  }

  has(id, name) {
    const store = this.stores.get(name);
    return !!store && store.has(id);
  }

  remove(id, name) {
    const store = this.stores.get(name);
    if (store) store.delete(id);
  }

  query(...names) {
    if (names.length === 0) return [];
    let smallest = null;
    for (const n of names) {
      const s = this.stores.get(n);
      if (!s) return [];
      if (!smallest || s.size < smallest.size) smallest = s;
    }
    const result = [];
    outer:
    for (const id of smallest.keys()) {
      for (const n of names) {
        if (!this.stores.get(n).has(id)) continue outer;
      }
      result.push(id);
    }
    return result;
  }

  clear() {
    this.stores.clear();
    this.nextId = 1;
    this.free.length = 0;
  }

  count(name) {
    const s = this.stores.get(name);
    return s ? s.size : 0;
  }
}
