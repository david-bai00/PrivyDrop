// Used to calculate transfer speed, supports multiple peerIds
export class SpeedCalculator {
  private speeds: Map<string, number>; //peerId,speed
  private windowSize: number = 2; // 5-second sliding window
  private transferHistory: Map<
    string,
    Array<{ time: number; totalBytes: number }>
  >; //peerId={time, totalBytes}
  private maxSpeed: number = 1024 * 1024; // Maximum speed limit (KB/s)
  private lastUpdateTimes: Map<string, number>; // Record the last update time for each peerId
  private updateInterval: number = 100; // Minimum update interval (ms)

  constructor() {
    this.speeds = new Map();
    this.transferHistory = new Map();
    this.lastUpdateTimes = new Map();
  }

  updateSendSpeed(peerId: string, totalBytesSent: number): void {
    const now = Date.now();

    // Check if the update interval has been reached
    const lastUpdate = this.lastUpdateTimes.get(peerId) || 0;
    if (now - lastUpdate < this.updateInterval) {
      return; // If the interval is too short, return directly
    }

    // Initialize or get transfer history
    if (!this.transferHistory.has(peerId)) {
      this.transferHistory.set(peerId, []);
    }
    const history = this.transferHistory.get(peerId)!;

    // Add a new cumulative transfer record
    history.push({ time: now, totalBytes: totalBytesSent });

    // Remove old data outside the window
    const windowStart = now - this.windowSize * 1000;

    while (history.length > 0 && history[0].time < windowStart) {
      history.shift();
    }

    // Calculate the total transfer amount and time difference within the window
    if (history.length > 1) {
      // Use the first and last points within the window to calculate speed
      const firstRecord = history[0];
      const lastRecord = history[history.length - 1];

      const bytesDiff = lastRecord.totalBytes - firstRecord.totalBytes;
      const timeSpan = (lastRecord.time - firstRecord.time) / 1000; // Convert to seconds

      // Calculate speed (KB/s) and apply limits
      let speed = timeSpan > 0 ? bytesDiff / 1024 / timeSpan : 0;
      speed = Math.min(speed, this.maxSpeed);

      // Reduce the smoothing factor to make the speed react faster to changes
      const oldSpeed = this.speeds.get(peerId) || 0;
      const smoothingFactor = 0.3; // Reduce the smoothing factor
      const smoothedSpeed =
        oldSpeed * (1 - smoothingFactor) + speed * smoothingFactor;

      this.speeds.set(peerId, smoothedSpeed);
    }

    // Update the last update time
    this.lastUpdateTimes.set(peerId, now);
  }

  getSendSpeed(peerId: string): number {
    return this.speeds.get(peerId) || 0;
  }
}
