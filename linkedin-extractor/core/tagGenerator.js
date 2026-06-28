export function generateTags(posts) {
    const keywords = {
        "Backend": ["backend", "api", "server"],
        "Frontend": ["frontend", "ui", "ux", "css", "html"],
        "React": ["react", "reactjs", "react.js"],
        "Node": ["node", "nodejs", "node.js"],
        "Java": ["java", "spring", "springboot"],
        "Python": ["python", "django", "flask"],
        "Remote": ["remote", "work from home", "wfh"],
        "Internship": ["intern", "internship"],
        "Freshers": ["fresher", "entry level", "entry-level", "0-1 years"]
    };

    return posts.map(post => {
        const textLower = post.text.toLowerCase();
        const tags = [];
        for (const [tag, terms] of Object.entries(keywords)) {
            if (terms.some(term => textLower.includes(term))) {
                tags.push(tag);
            }
        }
        return { ...post, tags };
    });
}
