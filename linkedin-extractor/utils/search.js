export function searchJobs(jobs, query) {
    if (!query || query.trim() === '') return jobs;
    const keywords = query.toLowerCase().split(' ').filter(k => k.trim() !== '');
    
    return jobs.filter(job => {
        const textToSearch = [
            job.company,
            job.role,
            job.post,
            ...job.tags
        ].join(' ').toLowerCase();

        return keywords.every(kw => textToSearch.includes(kw));
    });
}
