import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore';

function env(name) {
  return String(import.meta.env[name] || '').trim();
}

function firebaseConfigFromEnv() {
  return {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET')
  };
}

function isConfigured(config) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || ''
  };
}

export class CloudSaveManager {
  constructor({
    onStateChange = null,
    getLocalSnapshot = null,
    applyMergedSnapshot = null
  } = {}) {
    this.onStateChange = onStateChange;
    this.getLocalSnapshot = getLocalSnapshot;
    this.applyMergedSnapshot = applyMergedSnapshot;
    this.config = firebaseConfigFromEnv();
    this.configured = isConfigured(this.config);
    this.app = null;
    this.auth = null;
    this.db = null;
    this.user = null;
    this.unsubscribeAuth = null;
    this.syncTimer = null;
    this.syncInFlight = null;
    this.state = {
      configured: this.configured,
      status: this.configured ? 'initializing' : 'unconfigured',
      user: null,
      error: null,
      lastTestAt: null,
      lastSyncAt: null
    };
  }

  emit(patch = {}) {
    this.state = { ...this.state, ...patch, user: publicUser(this.user) };
    this.onStateChange?.({ ...this.state });
  }

  async init() {
    if (!this.configured) {
      this.emit({ status: 'unconfigured', error: null });
      return false;
    }

    try {
      this.app = initializeApp(this.config);
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);

      try {
        await setPersistence(this.auth, browserLocalPersistence);
      } catch (error) {
        console.warn('[CloudSave] auth persistence unavailable', error);
      }

      try {
        await getRedirectResult(this.auth);
      } catch (error) {
        console.warn('[CloudSave] redirect result failed', error);
        this.emit({ status: 'error', error });
      }

      this.unsubscribeAuth = onAuthStateChanged(this.auth, user => {
        this.user = user;
        this.emit({
          status: user ? 'signed_in' : 'signed_out',
          error: null
        });
        if (user) this.syncNow();
      });
      return true;
    } catch (error) {
      console.error('[CloudSave] init failed', error);
      this.emit({ status: 'error', error });
      return false;
    }
  }

  async signIn() {
    if (!this.auth || !this.configured) return false;

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    this.emit({ status: 'signing_in', error: null });

    try {
      // Use popup on desktop and mobile. Redirect auth can fail to restore
      // Firebase state in Safari because of cross-site storage restrictions.
      const result = await signInWithPopup(this.auth, provider);
      this.user = result.user;
      this.emit({ status: 'signed_in', error: null });
      return true;
    } catch (error) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        this.emit({ status: this.user ? 'signed_in' : 'signed_out', error: null });
        return false;
      }
      console.error('[CloudSave] Google sign-in failed', error);
      this.emit({ status: 'error', error });
      return false;
    }
  }

  async signOut() {
    if (!this.auth) return;
    try {
      await firebaseSignOut(this.auth);
      this.user = null;
      this.emit({ status: 'signed_out', error: null });
    } catch (error) {
      console.error('[CloudSave] sign-out failed', error);
      this.emit({ status: 'error', error });
    }
  }

  scheduleSync(delayMs = 6000) {
    if (!this.user || !this.db || !this.getLocalSnapshot) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.syncNow();
    }, delayMs);
  }

  mergeUniqueStrings(a = [], b = []) {
    return [...new Set([...(a || []), ...(b || [])])];
  }

  mergeCompletionDates(a = {}, b = {}) {
    const out = { ...(a || {}) };
    for (const [key, value] of Object.entries(b || {})) {
      if (!out[key] || (value && value < out[key])) out[key] = value;
    }
    return out;
  }

  mergeRoutes(localRoutes = [], cloudRoutes = [], generation = 0) {
    const map = new Map();
    for (const point of [...cloudRoutes, ...localRoutes]) {
      if (!point) continue;
      const lat = Number(point.lat);
      const lon = Number(point.lon);
      const t = Number(point.t);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) continue;
      const key = `${t}|${lat.toFixed(6)}|${lon.toFixed(6)}`;
      map.set(key, { lat, lon, t });
    }
    const routes = [...map.values()].sort((a, b) => a.t - b.t);
    return {
      generation,
      routes: routes.length > 50000 ? routes.slice(routes.length - 50000) : routes
    };
  }

  async readCloudSnapshot() {
    if (!this.db || !this.user) return null;

    const uid = this.user.uid;
    const metaRef = doc(this.db, 'users', uid, 'exploration', 'main');
    const [metaSnap, chunksSnap] = await Promise.all([
      getDoc(metaRef),
      getDocs(collection(this.db, 'users', uid, 'routeChunks'))
    ]);

    const meta = metaSnap.exists() ? metaSnap.data() : null;
    if (!meta) return null;

    const generation = Number(meta.routeGeneration || 0);
    const routeSnapshotId = typeof meta.routeSnapshotId === 'string' && meta.routeSnapshotId
      ? meta.routeSnapshotId
      : null;
    const routeChunks = [];
    chunksSnap.forEach(snapshot => {
      const data = snapshot.data();
      // New snapshots are isolated by upload ID. Legacy saves still use routeGeneration.
      if (routeSnapshotId) {
        if (data.routeSnapshotId !== routeSnapshotId) return;
      } else if (Number(data.routeGeneration || 0) !== generation) {
        return;
      }
      routeChunks.push({
        index: Number(data.index || 0),
        points: Array.isArray(data.points) ? data.points : []
      });
    });
    routeChunks.sort((a, b) => a.index - b.index);

    return {
      version: Number(meta.version || 2),
      totalDistanceMeters: Number(meta.totalDistanceMeters || 0),
      routeGeneration: generation,
      routes: routeChunks.flatMap(chunk => chunk.points),
      discoveredPOIs: Array.isArray(meta.discoveredPOIs) ? meta.discoveredPOIs : [],
      completedFeatures: Array.isArray(meta.completedFeatures) ? meta.completedFeatures : [],
      unlockedObelisks: Array.isArray(meta.unlockedObelisks) ? meta.unlockedObelisks : [],
      completionDates: meta.completionDates || {},
      settings: meta.settings || {}
    };
  }

  mergeSnapshots(local, cloud) {
    if (!cloud) return { ...local, version: 2 };

    const localGeneration = Number(local.routeGeneration || 0);
    const cloudGeneration = Number(cloud.routeGeneration || 0);
    let routeGeneration;
    let routes;

    if (localGeneration > cloudGeneration) {
      routeGeneration = localGeneration;
      routes = local.routes || [];
    } else if (cloudGeneration > localGeneration) {
      routeGeneration = cloudGeneration;
      routes = cloud.routes || [];
    } else {
      const merged = this.mergeRoutes(local.routes || [], cloud.routes || [], localGeneration);
      routeGeneration = merged.generation;
      routes = merged.routes;
    }

    return {
      version: 2,
      totalDistanceMeters: Math.max(
        Number(local.totalDistanceMeters || 0),
        Number(cloud.totalDistanceMeters || 0)
      ),
      routeGeneration,
      routes,
      discoveredPOIs: this.mergeUniqueStrings(local.discoveredPOIs, cloud.discoveredPOIs),
      completedFeatures: this.mergeUniqueStrings(local.completedFeatures, cloud.completedFeatures)
        .map(Number).filter(Number.isFinite),
      unlockedObelisks: this.mergeUniqueStrings(local.unlockedObelisks, cloud.unlockedObelisks)
        .map(Number).filter(Number.isFinite),
      completionDates: this.mergeCompletionDates(local.completionDates, cloud.completionDates),
      settings: { ...(cloud.settings || {}), ...(local.settings || {}) }
    };
  }

  async writeCloudSnapshot(snapshot) {
    const uid = this.user.uid;
    const routeGeneration = Number(snapshot.routeGeneration || 0);
    const points = Array.isArray(snapshot.routes) ? snapshot.routes : [];

    // Keep each document and each request small. Firestore's request-size
    // limit is byte-based, not just a limit on the number of writes.
    const chunkSize = 250;
    const writesPerBatch = 20;
    const routeSnapshotId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    const chunks = [];
    for (let i = 0; i < points.length; i += chunkSize) {
      chunks.push(points.slice(i, i + chunkSize));
    }

    const chunkCollection = collection(this.db, 'users', uid, 'routeChunks');
    const existing = await getDocs(chunkCollection);
    const desiredIds = new Set(
      chunks.map((_, index) => 's' + routeSnapshotId + '_c' + String(index).padStart(4, '0'))
    );

    // Stage the new snapshot under unique document IDs. Do not delete or
    // overwrite the currently active snapshot while these batches are uploading.
    for (let start = 0; start < chunks.length; start += writesPerBatch) {
      const batch = writeBatch(this.db);
      const end = Math.min(start + writesPerBatch, chunks.length);
      for (let index = start; index < end; index++) {
        const id = 's' + routeSnapshotId + '_c' + String(index).padStart(4, '0');
        batch.set(doc(this.db, 'users', uid, 'routeChunks', id), {
          routeGeneration,
          routeSnapshotId,
          index,
          points: chunks[index],
          pointCount: chunks[index].length,
          updatedAt: serverTimestamp()
        }, { merge: false });
      }
      await batch.commit();
    }

    // Publish metadata only after every chunk has committed. Readers continue
    // using the previous complete snapshot if any upload batch fails.
    const metaRef = doc(this.db, 'users', uid, 'exploration', 'main');
    await setDoc(metaRef, {
      version: 2,
      totalDistanceMeters: Number(snapshot.totalDistanceMeters || 0),
      routeGeneration,
      routeSnapshotId,
      routePointCount: points.length,
      routeChunkCount: chunks.length,
      discoveredPOIs: snapshot.discoveredPOIs || [],
      completedFeatures: snapshot.completedFeatures || [],
      unlockedObelisks: snapshot.unlockedObelisks || [],
      completionDates: snapshot.completionDates || {},
      settings: snapshot.settings || {},
      updatedAt: serverTimestamp(),
      clientUpdatedAt: new Date().toISOString()
    }, { merge: false });

    // Cleanup is maintenance after the active pointer has switched. If cleanup
    // fails, the published snapshot is still valid and a later sync can retry it.
    const staleRefs = [];
    existing.forEach(snapshotDoc => {
      if (!desiredIds.has(snapshotDoc.id)) staleRefs.push(snapshotDoc.ref);
    });
    try {
      for (let start = 0; start < staleRefs.length; start += writesPerBatch) {
        const batch = writeBatch(this.db);
        for (const ref of staleRefs.slice(start, start + writesPerBatch)) {
          batch.delete(ref);
        }
        await batch.commit();
      }
    } catch (error) {
      console.warn('[CloudSave] stale route chunk cleanup failed; active snapshot is safe', error);
    }
  }

  async syncNow() {
    if (!this.db || !this.user || !this.getLocalSnapshot) return false;
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = (async () => {
      this.emit({ status: 'syncing', error: null });
      try {
        const local = this.getLocalSnapshot();
        const cloud = await this.readCloudSnapshot();
        const merged = this.mergeSnapshots(local, cloud);
        this.applyMergedSnapshot?.(merged);
        await this.writeCloudSnapshot(merged);
        const now = new Date().toISOString();
        this.emit({ status: 'synced', error: null, lastSyncAt: now, lastTestAt: now });
        return true;
      } catch (error) {
        console.error('[CloudSave] sync failed', error);
        this.emit({ status: 'error', error });
        return false;
      } finally {
        this.syncInFlight = null;
      }
    })();

    return this.syncInFlight;
  }

  async testWrite() {
    return this.syncNow();
  }

  destroy() {
    clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
  }
}
