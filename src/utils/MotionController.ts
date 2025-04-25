export class MotionController {
    private currentValue: number;
    private targetValue: number;
    private transitionRate: number;

    constructor(initialValue: number = 0, transitionRate: number = 0.1) {
        this.currentValue = initialValue;
        this.targetValue = initialValue;
        this.transitionRate = transitionRate;
    }

    setTarget(value: number) {
        this.targetValue = value;
    }

    update() {
        this.currentValue += (this.targetValue - this.currentValue) * this.transitionRate;
        return this.currentValue;
    }

    getValue() {
        return this.currentValue;
    }
}
