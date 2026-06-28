export function cleanup(jobs) {
    const now = Date.now();
    return jobs.filter(job => new Date(job.expiresAt).getTime() > now);
}
