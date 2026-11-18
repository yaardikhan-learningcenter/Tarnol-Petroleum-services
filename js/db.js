const firebaseConfig = window.FIREBASE_CONFIG || {};
export const COLS = ['items','nozzles','customers','suppliers','employees','shifts','purchases','expenses','receipts','supplierPayments','employeeTx','adjustments','settings'];
export const demo = !firebaseConfig.apiKey;
let impl;

if (demo) {
  const KEY = 'tarnol_erp_demo'; let store = {}; const subs = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { store = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
  const emit = c => subs[c] && subs[c](Object.entries(store[c] || {}).map(([id, v]) => ({ ...v, id })));
  impl = {
    async init() {},
    onAuth(cb) { cb({ email: 'demo@local' }); },
    async login() {}, async logout() { location.reload(); },
    subscribe(c, cb) { subs[c] = cb; emit(c); },
    async save(c, id, data) {
      id = id || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      (store[c] ||= {})[id] = { ...(store[c][id] || {}), ...data }; persist(); emit(c); return id;
    },
    async remove(c, id) { delete (store[c] || {})[id]; persist(); emit(c); },
    async replaceAll(obj) { store = obj; persist(); Object.keys(subs).forEach(emit); },
    exportAll() { return JSON.parse(JSON.stringify(store)); }
  };
} else {
  const V = '10.12.2', B = `https://www.gstatic.com/firebasejs/${V}/`;
  let fs, auth, fa, db, cache = {};
  impl = {
    async init() {
      const [app, f, a] = await Promise.all([import(B + 'firebase-app.js'), import(B + 'firebase-firestore.js'), import(B + 'firebase-auth.js')]);
      const ap = app.initializeApp(firebaseConfig);
      fs = f; fa = a; auth = a.getAuth(ap);
      db = f.initializeFirestore(ap, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) });
    },
    onAuth(cb) { fa.onAuthStateChanged(auth, cb); },
    login(email, pass) { return fa.signInWithEmailAndPassword(auth, email, pass); },
    logout() { return fa.signOut(auth); },
    subscribe(c, cb) {
      return fs.onSnapshot(fs.collection(db, c), snap => { cache[c] = snap.docs.map(d => ({ ...d.data(), id: d.id })); cb(cache[c]); },
        err => { console.error(c, err); window.dispatchEvent(new CustomEvent('db-error', { detail: err })); });
    },
    // Writes are applied to the local cache immediately and queued for the server, so we must NOT
    // await the server acknowledgement (it never arrives while offline). Errors are reported asynchronously.
    async save(c, id, data) {
      const ref = id ? fs.doc(db, c, id) : fs.doc(fs.collection(db, c));
      fs.setDoc(ref, data, { merge: true }).catch(err => window.dispatchEvent(new CustomEvent('db-error', { detail: err })));
      return ref.id;
    },
    async remove(c, id) { fs.deleteDoc(fs.doc(db, c, id)).catch(err => window.dispatchEvent(new CustomEvent('db-error', { detail: err }))); },
    async replaceAll(obj) {
      for (const [c, docs] of Object.entries(obj)) for (const [id, v] of Object.entries(docs)) fs.setDoc(fs.doc(db, c, id), v).catch(err => window.dispatchEvent(new CustomEvent('db-error', { detail: err })));
    },
    exportAll() { const o = {}; for (const c of COLS) { o[c] = {}; (cache[c] || []).forEach(d => { const { id, ...r } = d; o[c][id] = r; }); } return o; }
  };
}
export default impl;
