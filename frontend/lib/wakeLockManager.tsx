//当 Android 设备切换到其他应用时，屏幕会保持唤醒状态，WebRTC 连接也就不会断开了。需要注意的是，这会增加设备的电量消耗，所以在连接断开时及时释放 wake lock 很重要。
export class WakeLockManager {
    private wakeLock: WakeLockSentinel | null = null;
    private isSupported: boolean = false;

    constructor() {
      // 检查浏览器是否支持 Wake Lock API
      this.isSupported = 'wakeLock' in navigator;
    }
  
    async requestWakeLock(): Promise<void> {
      if (!this.isSupported) {
        console.warn('Wake Lock API is not supported in this browser');
        return;
      }
      if (document.visibilityState !== 'visible') {//只在页面可见时请求
        console.warn('Wake Lock API should request in visible state');
        return;
      }
      try {
        // 请求screen wake lock
        this.wakeLock = await navigator.wakeLock.request('screen');
        
        // 监听visibility change事件，在页面重新可见时重新请求wake lock
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        console.log('Wake Lock is active');
      } catch (err) {
        console.error('Error requesting wake lock:', err);
      }
    }
  
    private handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && this.wakeLock === null) {
        // 页面重新可见时，重新请求wake lock
        await this.requestWakeLock();
      }
    };
  
    async releaseWakeLock(): Promise<void> {
      if (!this.wakeLock) return;
  
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        console.log('Wake Lock is released');
      } catch (err) {
        console.error('Error releasing wake lock:', err);
      }
    }
  }