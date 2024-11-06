window.configManager = {
    openDB: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("PortfolioDB", 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore("configs", { keyPath: "id" });
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    configOperations: {
        async saveConfig(configName, config) {
            const db = await this.openDB();
            const transaction = db.transaction("configs", "readwrite");
            await transaction.objectStore("configs").put({
                id: configName,
                ...config
            });
            return `Configuration '${configName}' saved!`;
        },

        async loadConfig(configName) {
            const db = await this.openDB();
            const config = await db.transaction("configs")
                .objectStore("configs")
                .get(configName);

            if (!config) {
                throw new Error("Configuration not found");
            }
            return config;
        },

        async listConfigs() {
            const db = await this.openDB();
            return db.transaction("configs")
                .objectStore("configs")
                .getAllKeys();
        },

        async deleteConfig(configName) {
            const db = await this.openDB();
            await db.transaction("configs", "readwrite")
                .objectStore("configs")
                .delete(configName);
            return `Configuration '${configName}' deleted`;
        }
    },
    validateConfig: function(config) {
        const required = ['name', 'title', 'location', 'skills', 'projects'];
        const missing = required.filter(key => !config[key]);
        return missing.length === 0 ? true : `Missing required fields: ${missing.join(', ')}`;
    },
    configHistory: {
        past: [],
        current: null,
        future: []
    },
    historyOperations: {
        saveState(config) {
            this.configHistory.past.push({...this.configHistory.current});
            this.configHistory.current = {...config};
            this.configHistory.future = [];
        },

        undo() {
            if (this.configHistory.past.length > 0) {
                this.configHistory.future.push({...this.configHistory.current});
                this.configHistory.current = this.configHistory.past.pop();
                return this.configHistory.current;
            }
            return null;
        },

        redo() {
            if (this.configHistory.future.length > 0) {
                this.configHistory.past.push({...this.configHistory.current});
                this.configHistory.current = this.configHistory.future.pop();
                return this.configHistory.current;
            }
            return null;
        },

        getTimeline() {
            return {
                past: [...this.configHistory.past],
                current: {...this.configHistory.current},
                future: [...this.configHistory.future]
            };
        }
    }
};
