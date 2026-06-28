export const JobSchema = {
    id: "",
    hash: "",
    company: "",
    role: "",
    post: "",
    emails: [],
    phones: [],
    links: [],
    tags: [],
    createdAt: "",
    lastSeenAt: "",
    expiresAt: "",
    status: "New",
    notes: "",
    sentToN8n: false,
    emailSent: false
};

export const RootSchema = {
    jobs: [],
    settings: {
        webhook: "",
        retentionHours: 24
    },
    stats: {
        lastExtract: "",
        totalJobs: 0
    }
};
