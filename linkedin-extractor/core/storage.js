import { RootSchema } from './schema.js';

export const storage = {
    async loadAll() {
        const data = await chrome.storage.local.get(null);
        if (!data.settings) {
            await this.saveAll(RootSchema);
            return RootSchema;
        }
        return data;
    },
    async saveAll(data) {
        await chrome.storage.local.set(data);
    },
    async loadJobs() {
        const data = await this.loadAll();
        return data.jobs || [];
    },
    async saveJobs(jobs) {
        await chrome.storage.local.set({ jobs });
    },
    async loadSettings() {
        const data = await this.loadAll();
        return data.settings || RootSchema.settings;
    },
    async saveSettings(settings) {
        await chrome.storage.local.set({ settings });
    },
    async cleanup() {
        const data = await this.loadAll();
        const now = Date.now();
        data.jobs = data.jobs.filter(job => new Date(job.expiresAt).getTime() > now);
        await this.saveAll(data);
    }
};
