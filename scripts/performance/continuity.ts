/** Detect host sleep, VM suspension and long stalls that invalidate sustained load. */
export class MeasurementContinuity {
  maximumGapMs = 0;
  constructor(private previousMonotonic: number, private previousWall: number) {}

  sample(monotonic: number, wall: number): void {
    this.maximumGapMs = Math.max(this.maximumGapMs, monotonic - this.previousMonotonic, wall - this.previousWall);
    this.previousMonotonic = monotonic;
    this.previousWall = wall;
  }

  get valid(): boolean { return this.maximumGapMs <= 20_000; }
}
