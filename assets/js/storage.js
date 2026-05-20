/**
 * storage.js — IndexedDB storage layer for MD Docs
 * Manages documents, media files, and blob caching.
 */
class Storage {
  constructor(dbName = 'MDDocsDB', version = 2) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          docStore.createIndex('title', 'title', { unique: false });
        }
        if (!db.objectStoreNames.contains('media')) {
          const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
          mediaStore.createIndex('createdAt', 'createdAt', { unique: false });
          mediaStore.createIndex('mimeType', 'mimeType', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  _getStore(name, mode = 'readonly') {
    const tx = this.db.transaction(name, mode);
    return tx.objectStore(name);
  }

  // ─── Document CRUD ─────────────────────────────

  async getAllDocuments() {
    const store = this._getStore('documents');
    return new Promise((resolve, reject) => {
      const req = store.index('updatedAt').openCursor(null, 'prev');
      const docs = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          docs.push(cursor.value);
          cursor.continue();
        } else {
          resolve(docs);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getDocument(id) {
    const store = this._getStore('documents');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async saveDocument(doc) {
    const now = Date.now();
    if (!doc.id) doc.id = crypto.randomUUID();
    doc.updatedAt = now;
    if (!doc.createdAt) doc.createdAt = now;
    const store = this._getStore('documents', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(doc);
      req.onsuccess = () => resolve(doc.id);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDocument(id) {
    const store = this._getStore('documents', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── Media CRUD ────────────────────────────────

  async saveMedia(media) {
    if (!media.id) media.id = crypto.randomUUID();
    media.createdAt = Date.now();
    const store = this._getStore('media', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(media);
      req.onsuccess = () => resolve(media.id);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getMedia(id) {
    const store = this._getStore('media');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllMedia() {
    const store = this._getStore('media');
    return new Promise((resolve, reject) => {
      const req = store.index('createdAt').openCursor(null, 'prev');
      const items = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteMedia(id) {
    const store = this._getStore('media', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── Helpers ───────────────────────────────────

  /** Extract all media:// IDs from markdown content */
  extractMediaIds(markdown) {
    const refs = markdown.match(/media:\/\/([a-zA-Z0-9-]+)/g) || [];
    return [...new Set(refs.map((r) => r.split('media://')[1]))];
  }

  /** Get media blobs and create blob URLs for a set of media IDs */
  async resolveMediaBlobs(ids, cache) {
    const result = {};
    for (const id of ids) {
      if (cache.has(id)) {
        result[id] = cache.get(id).blobUrl;
        continue;
      }
      const media = await this.getMedia(id);
      if (media && media.data) {
        const blobUrl = URL.createObjectURL(media.data);
        cache.set(id, { blobUrl, blob: media.data });
        result[id] = blobUrl;
      }
    }
    return result;
  }

  /**
   * Replace media://ID references in markdown with blob URLs.
   * Returns { html: string, cleanup: Function }
   */
  async renderContent(markdown, cache) {
    const ids = this.extractMediaIds(markdown);
    const blobMap = await this.resolveMediaBlobs(ids, cache);

    let resolved = markdown;
    for (const [id, url] of Object.entries(blobMap)) {
      const re = new RegExp(`media://${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      resolved = resolved.replace(re, url);
    }

    return { resolved };
  }

  /** Clean up blob URLs no longer referenced */
  cleanupCache(markdown, cache) {
    const currentIds = new Set(this.extractMediaIds(markdown));
    for (const [id, entry] of cache) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(entry.blobUrl);
        cache.delete(id);
      }
    }
  }
}
