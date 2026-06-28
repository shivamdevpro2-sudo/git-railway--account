import { generateSHA256, generateUUID } from '../utils/crypto.js';
import { storage } from './storage.js';
import { JobSchema } from './schema.js';

export async function deduplicate(posts, context) {
    const existingJobs = await storage.loadJobs();
    const existingHashMap = new Map();
    existingJobs.forEach(job => existingHashMap.set(job.hash, job));

    const retentionHours = context.settings ? context.settings.retentionHours : 24;
    const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000).toISOString();
    const nowStr = new Date().toISOString();

    const result = [];
    for (const post of posts) {
        // use company and text to generate hash
        const hash = await generateSHA256(post.company + post.text);
        
        if (existingHashMap.has(hash)) {
            // Update lastSeenAt
            const existing = existingHashMap.get(hash);
            existing.lastSeenAt = nowStr;
            existing.expiresAt = expiresAt; // extend expiry
        } else {
            // Create new
            const newJob = {
                ...JobSchema,
                ...post,
                id: generateUUID(),
                hash: hash,
                createdAt: nowStr,
                lastSeenAt: nowStr,
                expiresAt: expiresAt
            };
            existingHashMap.set(hash, newJob);
            result.push(newJob);
        }
    }
    
    // Return the full updated list to be saved
    return Array.from(existingHashMap.values());
}
