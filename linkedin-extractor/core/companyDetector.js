export function detectCompany(posts) {
    const rules = [
        (post) => post.companyNodeText,
        (post) => {
            const firstLine = post.text.split('\n')[0];
            return firstLine.length < 50 ? firstLine : null;
        },
        (post) => {
            const match = post.text.match(/Company:\s*([^\n]+)/i);
            return match ? match[1] : null;
        },
        (post) => {
            const match = post.text.match(/Join\s+([A-Z][a-zA-Z0-9\s]+)/i);
            return match ? match[1] : null;
        },
        (post) => {
            const match = post.text.match(/We're Hiring at\s+([A-Z][a-zA-Z0-9\s]+)/i);
            return match ? match[1] : null;
        }
    ];

    return posts.map(post => {
        let company = "Unknown";
        for (const rule of rules) {
            const detected = rule(post);
            if (detected && detected.trim() !== "") {
                company = detected.trim();
                break;
            }
        }
        return { ...post, company };
    });
}
