export function normalize(posts) {
    return posts.map(post => {
        return {
            ...post,
            text: post.text ? post.text.trim() : "",
            emails: [...new Set(post.emails)].map(e => e.toLowerCase()),
            phones: [...new Set(post.phones)],
            links: [...new Set(post.links)]
        };
    });
}
