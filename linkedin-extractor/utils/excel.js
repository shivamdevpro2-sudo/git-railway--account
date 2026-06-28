export function generateExcel(jobs, filename) {
    if (!window.XLSX) {
        console.error("SheetJS is not loaded.");
        return;
    }
    const data = jobs.map(job => ({
        Company: job.company,
        Role: job.role,
        Emails: job.emails.join('; '),
        Phones: job.phones.join('; '),
        Links: job.links.join('; '),
        Tags: job.tags.join('; '),
        Post: job.post,
        ExtractedAt: job.createdAt
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
    XLSX.writeFile(workbook, filename);
}
