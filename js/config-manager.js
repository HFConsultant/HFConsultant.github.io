export const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("PortfolioDB", 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore("configs", { keyPath: "id" });
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const configOperations = {
    async saveConfig(configName, config) {
        const db = await openDB();
        const transaction = db.transaction("configs", "readwrite");
        await transaction.objectStore("configs").put({
            id: configName,
            ...config
        });
        return `Configuration '${configName}' saved!`;
    },

    async loadConfig(configName) {
        const db = await openDB();
        const config = await db.transaction("configs")
            .objectStore("configs")
            .get(configName);

        if (!config) {
            throw new Error("Configuration not found");
        }
        return config;
    },

    async listConfigs() {
        const db = await openDB();
        return db.transaction("configs")
            .objectStore("configs")
            .getAllKeys();
    },

    async deleteConfig(configName) {
        const db = await openDB();
        await db.transaction("configs", "readwrite")
            .objectStore("configs")
            .delete(configName);
        return `Configuration '${configName}' deleted`;
    }
};

export const validateConfig = (config) => {
    const required = ['name', 'title', 'location', 'skills', 'projects'];
    const missing = required.filter(key => !config[key]);
    return missing.length === 0 ? true : `Missing required fields: ${missing.join(', ')}`;
};

export const configHistory = {
    past: [],
    current: null,
    future: []
};

export const historyOperations = {
    saveState(config) {
        configHistory.past.push({...configHistory.current});
        configHistory.current = {...config};
        configHistory.future = [];
    },

    undo() {
        if (configHistory.past.length > 0) {
            configHistory.future.push({...configHistory.current});
            configHistory.current = configHistory.past.pop();
            return configHistory.current;
        }
        return null;
    },

    redo() {
        if (configHistory.future.length > 0) {
            configHistory.past.push({...configHistory.current});
            configHistory.current = configHistory.future.pop();
            return configHistory.current;
        }
        return null;
    },

    getTimeline() {
        return {
            past: [...configHistory.past],
            current: {...configHistory.current},
            future: [...configHistory.future]
        };
    }
};
