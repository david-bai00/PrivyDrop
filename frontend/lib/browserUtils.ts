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
 * 检测是否支持程序化下载
 * Chrome 支持长时间传输后的自动下载，其他浏览器可能有限制
 * @returns {boolean} 如果支持自动下载返回 true
 */
export const supportsAutoDownload = (): boolean => {
  return isChrome();
};
