/**
 * Browser detection utility functions
 * Extended to support Firefox WebRTC compatibility handling
 */

/**
 * Detect if the browser is Chrome
 * @returns {boolean} Returns true if it's Chrome, otherwise false
 */
export const isChrome = (): boolean => {
  // Detect Chrome browser, excluding Chromium-based Edge
  const userAgent = navigator.userAgent;

  return (
    userAgent.includes("Chrome") && !userAgent.includes("Edg") // Exclude Edge
  );
};

/**
 * Detect if programmatic download is supported
 * Chrome supports automatic download after long transfers, other browsers may have limitations
 * @returns {boolean} Returns true if automatic download is supported
 */

export const supportsAutoDownload = (): boolean => {
  return isChrome();
};
