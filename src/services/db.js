export class DatabaseService {
    constructor(logger) {
        this.logger = logger;
        this.dbName = "PoliceDB_Ent_V9";
        this.storeName = "records";
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "id", autoIncrement: true });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                this.logger.log("Database Connection Established", "success");
                resolve(true);
            };

            req.onerror = (e) => {
                this.logger.log("Database Connection Failed", "error");
                reject(e);
            };
        });
    }

    async addRecord(data) {
        const tx = this.db.transaction([this.storeName], "readwrite");
        tx.objectStore(this.storeName).add(data);
        return new Promise(resolve => {
            tx.oncomplete = () => {
                this.logger.log(`Record Added: ${data.name}`, "success");
                resolve(true);
            }
        });
    }

    async getAllRecords() {
        if (!this.db) return [];
        const tx = this.db.transaction([this.storeName], "readonly");
        const store = tx.objectStore(this.storeName);
        return new Promise(resolve => {
            store.getAll().onsuccess = (e) => resolve(e.target.result);
        });
    }

    async deleteRecord(id) {
        const tx = this.db.transaction([this.storeName], "readwrite");
        tx.objectStore(this.storeName).delete(id);
        return new Promise(resolve => {
            tx.oncomplete = () => {
                this.logger.log(`Record ID ${id} Archived/Deleted`, "info");
                resolve(true);
            }
        });
    }
}
