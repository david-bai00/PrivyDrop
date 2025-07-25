# PrivyDrop Project Roadmap

Welcome to the official roadmap for PrivyDrop! This document outlines our vision for the future, detailing the planned features and improvements that will shape the project. Our goal is to build the most secure, private, and user-friendly P2P file sharing solution.

This roadmap is a living document. We welcome community feedback and contributions. If you have an idea or want to help build the future of PrivyDrop, please open an [Issue](https://github.com/david-bai00/PrivyDrop/issues) or a [Pull Request](https://github.com/david-bai00/PrivyDrop/pulls)!

---

## Short-Term Goals (Next 1-3 Months)

This phase focuses on perfecting the current feature set and enhancing reliability to build an even stronger foundation.

- **[High Priority] Resumable File Transfers:** Implement logic to allow file transfers to be paused and resumed. This is crucial for large files and unstable network conditions. It will involve chunk-based confirmation and state management on both peers.
- **Enhanced Connection Stability:** The current implementation supports automatic reconnection for a short period (e.g., 15 minutes) in default 4-digit rooms. This will be extended to support custom-named rooms with a longer reconnection window (e.g., 1 hour).
- **Detailed Transfer Error-Handling:** Provide users with clearer, more specific feedback when a transfer fails (e.g., "Peer disconnected," "Browser storage full," "Network interrupted").

---

## Mid-Term Goals (Next 3-9 Months)

This phase introduces powerful new features that expand PrivyDrop's use cases beyond one-to-one file transfers.

- **[Major Feature] P2P Group Chat:** While multiple peers can already join a room, this feature will add a simple, host-based group chat. The room creator will act as a hub to relay encrypted text and files to all other participants, enabling basic group collaboration.
- **Self-Destructing Messages & Files:** Allow users to send files or text messages that are automatically deleted from the recipient's view after being read or after a set time.
- **Clipboard Synchronization:** Add a dedicated mode to sync the clipboard content (text and images) in real-time between connected devices.
- **Official Docker Support:** Provide and maintain official `Dockerfile` and `docker-compose.yml` configurations for easy, one-command self-hosting of the entire stack.

### Performance and deployment

- **Official Docker support:** Provide and maintain the official `Dockerfile` and `docker-compose.yml` configurations to achieve one-click deployment of the entire technology stack (frontend, backend, Redis, Coturn), which greatly facilitates self-hosted users.
- **Package size optimization:** Regularly use `@next/bundle-analyzer` to analyze the frontend package size, optimize through code splitting and other means, and keep the application lightweight.

### User Experience (UX)

- **To be defined**

---

## Future & Community-Driven Ideas

This section is for features that are not on the immediate roadmap but represent great opportunities for community contributions.

- **Comprehensive Testing:** While manual testing currently suffices, we plan to gradually introduce a testing framework (like Jest/Vitest) to improve code quality and make community contributions safer. We welcome contributions in this area.
- **Your Ideas Here:** Have a great idea for a feature, like screen sharing or P2P media streaming? Open an issue and let's discuss it! We believe the best ideas can come from the community.

## How to Contribute

Your contributions are vital to making this roadmap a reality!

1.  **Pick an Issue:** Look for issues tagged with `help wanted` or `good first issue`.
2.  **Start a Discussion:** If you're interested in a roadmap item, start a discussion to share your ideas.
3.  **Submit a PR:** Fork the repo, create a feature branch, and submit a Pull Request.

Thank you for being part of the PrivyDrop community! Let's build the future of private sharing, together.
