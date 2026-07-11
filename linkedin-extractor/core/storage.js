import { RootSchema } from './schema.js';

const RAILWAY_URL = 'https://git-railway-account-production.up.railway.app';

export const storage = {
    async loadAll() {
        const data = await chrome.storage.local.get(null);
        if (!data.settings) {
            await this.saveAll(RootSchema);
            return RootSchema;
        }
        // Auto-migrate: replace old localhost URL with Railway URL
        const url = data.settings?.emailServerUrl || '';
        if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
            data.settings.emailServerUrl = RAILWAY_URL;
            await chrome.storage.local.set({ settings: data.settings });
            console.log('[Storage] Migrated emailServerUrl → Railway');
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
