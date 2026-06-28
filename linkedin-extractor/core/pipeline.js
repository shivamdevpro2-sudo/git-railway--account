export class Pipeline {
    constructor() {
        this.steps = [];
    }

    use(stepFunction) {
        this.steps.push(stepFunction);
        return this;
    }

    async execute(payload, context = {}) {
        let result = payload;
        for (const step of this.steps) {
            result = await step(result, context);
        }
        return result;
    }
}
