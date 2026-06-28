import { generateCSV } from '../utils/csv.js';
import { generateExcel } from '../utils/excel.js';

export const exporter = {
    downloadCSV(jobs) {
        const csvContent = generateCSV(jobs);
        this.triggerDownload(csvContent, 'text/csv', 'csv');
    },
    
    downloadExcel(jobs) {
        generateExcel(jobs, this.getFilename('xlsx'));
    },
    
    downloadJSON(jobs) {
        const content = JSON.stringify(jobs, null, 2);
        this.triggerDownload(content, 'application/json', 'json');
    },

    getFilename(ext) {
        const date = new Date().toISOString().split('T')[0];
        return `linkedin_jobs_${date}.${ext}`;
    },

    triggerDownload(content, mimeType, ext) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.getFilename(ext);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
