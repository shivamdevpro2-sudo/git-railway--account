export function validate(posts) {
    return posts.filter(post => post.text && post.text.length >= 40);
}
