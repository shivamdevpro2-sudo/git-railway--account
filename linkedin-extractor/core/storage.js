import { RootSchema } from './schema.js';

export const storage = {
    async loadAll() {
        const data = await chrome.storage.local.get(null);
        if (!data.settings) {
            await this.saveAll(RootSchema);
            return RootSchema;
        }
        // Auto-migrate: replace Railway URL back to localhost URL
        const url = data.settings?.emailServerUrl || '';
        if (url.includes('railway')) {
            data.settings.emailServerUrl = 'http://localhost:3457';
            await chrome.storage.local.set({ settings: data.settings });
            console.log('[Storage] Migrated emailServerUrl → localhost');
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
