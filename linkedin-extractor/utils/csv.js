export function generateCSV(jobs) {
    if (jobs.length === 0) return "";
    const headers = ["Company", "Role", "Emails", "Phones", "Links", "Tags", "Post", "ExtractedAt"];
    
    const rows = jobs.map(job => {
        return [
            job.company || "",
            job.role || "",
            job.emails.join('; ') || "",
            job.phones.join('; ') || "",
            job.links.join('; ') || "",
            job.tags.join('; ') || "",
            (job.post || "").replace(/"/g, '""'), // escape quotes
            job.createdAt || ""
        ].map(field => `"${field}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}
