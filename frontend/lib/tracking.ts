import { setTrack } from "@/app/config/api";
// The website tracks the source through ?ref=reddit..., here to get the source, for example https://yourdomain.com?ref=producthunt
export const trackReferrer = async () => {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  let ref = urlParams.get("ref");
  if (process.env.NODE_ENV === "production") {
    ref = urlParams.get("ref") || "noRef"; // Production environment, count daily active users, record as noRef if there is no ref
  }

  if (ref) {
    try {
      setTrack(ref);
      // Optional: Store the source in localStorage for subsequent tracking
      // localStorage.setItem('initial_ref', ref);
    } catch (error) {
      console.error("Failed to track referrer:", error);
    }
  }
};
