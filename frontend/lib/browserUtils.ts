/**
 * 浏览器检测工具函数
 * 扩展以支持Firefox WebRTC兼容性处理
 */

/**
 * 检测是否为 Chrome 浏览器
 * @returns {boolean} 如果是 Chrome 返回 true，否则返回 false
 */
export const isChrome = (): boolean => {
  // 检测 Chrome 浏览器，排除基于 Chromium 的 Edge
  const userAgent = navigator.userAgent;

  return (
    userAgent.includes("Chrome") && !userAgent.includes("Edg") // 排除 Edge
  );
};

/**
 * 检测是否为 Firefox 浏览器
 * @returns {boolean} 如果是 Firefox 返回 true，否则返回 false
 */
export const isFirefox = (): boolean => {
  return navigator.userAgent.includes("Firefox");
};

/**
 * 检测浏览器详细信息
 */
export function detectBrowser(): {
  name: string;
  version: string;
  isFirefox: boolean;
  isChrome: boolean;
  isSafari: boolean;
  isEdge: boolean;
} {
  const userAgent = navigator.userAgent;

  let name = "Unknown";
  let version = "Unknown";

  // Firefox检测
  if (userAgent.includes("Firefox/")) {
    name = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+(?:\.\d+)*)/);
    if (match) version = match[1];
  }
  // Chrome检测 (注意：需要在Edge之前检测，因为Edge也包含Chrome字符串)
  else if (userAgent.includes("Chrome/") && !userAgent.includes("Edg/")) {
    name = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+(?:\.\d+)*)/);
    if (match) version = match[1];
  }
  // Edge检测
  else if (userAgent.includes("Edg/")) {
    name = "Edge";
    const match = userAgent.match(/Edg\/(\d+(?:\.\d+)*)/);
    if (match) version = match[1];
  }
  // Safari检测
  else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) {
    name = "Safari";
    const match = userAgent.match(/Version\/(\d+(?:\.\d+)*)/);
    if (match) version = match[1];
  }

  return {
    name,
    version,
    isFirefox: name === "Firefox",
    isChrome: name === "Chrome",
    isSafari: name === "Safari",
    isEdge: name === "Edge",
  };
}

/**
 * 检测是否支持程序化下载
 * Chrome 支持长时间传输后的自动下载，其他浏览器可能有限制
 * @returns {boolean} 如果支持自动下载返回 true
 */
export const supportsAutoDownload = (): boolean => {
  return isChrome();
};

/**
 * 获取Firefox特定的WebRTC配置
 */
export function getFirefoxWebRTCConfig() {
  return {
    // Firefox可能需要更大的缓冲区阈值
    bufferThreshold: 65536 * 4, // 256KB instead of 64KB
    // Firefox可能需要更长的延迟
    requestDelay: 15, // 15ms instead of 10ms
    // Firefox对ArrayBuffer处理的特殊配置
    binaryType: "arraybuffer" as BinaryType,
  };
}

/**
 * 为Firefox优化DataChannel配置
 */
export function getDataChannelConfig(browserName?: string): RTCDataChannelInit {
  const isFirefoxBrowser = browserName === "Firefox" || isFirefox();

  if (isFirefoxBrowser) {
    return {
      ordered: true,
      // Firefox特定优化：更大的maxPacketLifeTime可能有助于数据传输
      maxRetransmits: 3,
    };
  }

  return {
    ordered: true,
  };
}

/**
 * 记录浏览器兼容性信息
 */
export function logBrowserCompatibility() {
  const browser = detectBrowser();
  const message = `[Browser Compatibility] Browser: ${browser.name} ${browser.version}, isFirefox: ${browser.isFirefox}, userAgent: ${navigator.userAgent}`;

  console.log(message);

  // 动态导入以避免循环依赖
  import("@/app/config/api")
    .then(({ postLogToBackend }) => {
      postLogToBackend(message);
    })
    .catch(console.error);

  return browser;
}
