export function detectRole(posts) {
    return posts.map(post => {
        let role = "Unknown";
        const match = post.text.match(/Role:\s*([^\n]+)/i) || 
                      post.text.match(/Looking for (?:a|an)?\s*([A-Za-z\s]+(?:Developer|Engineer|Manager|Designer|Intern))/i);
        if (match) {
            role = match[1].trim();
        } else if (post.text.toLowerCase().includes("intern") || post.text.toLowerCase().includes("internship")) {
             role = "Intern";
        }
        return { ...post, role };
    });
}
