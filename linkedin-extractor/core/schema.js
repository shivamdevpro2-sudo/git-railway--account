export const JobSchema = {
    id: "",
    hash: "",
    company: "",
    role: "",
    text: "",
    payout: "",
    postedAt: "",
    emails: [],
    phones: [],
    links: [],
    tags: [],
    createdAt: "",
    experience: "",
    postingTime: "",
    postUrl: "",
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
        emailServerUrl: "http://localhost:3457",
        retentionHours: 24
    },
    stats: {
        lastExtract: "",
        totalJobs: 0
    }
};
