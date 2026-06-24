import type { CustomFile } from "@/types/webrtc";
import type { createLogger } from "@/lib/logger";

type SenderPayloadLogger = Pick<
  ReturnType<typeof createLogger>,
  "warn" | "error"
>;

interface SenderPayloadBroadcasterDependencies {
  getPeerIds: () => string[];
  hasPeer: (peerId: string) => boolean;
  sendPayloadSnapshot: (
    content: string,
    files: CustomFile[],
    peerId: string
  ) => Promise<void>;
  sendString: (content: string, peerId: string) => Promise<void>;
  sendFileMeta: (files: CustomFile[], peerId: string) => Promise<void>;
  logger: SenderPayloadLogger;
}

export class SenderPayloadBroadcaster {
  constructor(private dependencies: SenderPayloadBroadcasterDependencies) {}

  public async broadcastToAllPeers(
    content: string,
    files: CustomFile[]
  ): Promise<boolean> {
    const peerIds = this.dependencies.getPeerIds();
    if (peerIds.length === 0) {
      this.dependencies.logger.warn({
        event: "broadcast_skipped_no_connected_peers",
      });
      return false;
    }

    try {
      await Promise.all(
        peerIds.map((peerId) => this.sendToPeer(peerId, content, files))
      );
      return true;
    } catch (error) {
      this.dependencies.logger.error({
        event: "broadcast_failed",
        context: { error },
      });
      return false;
    }
  }

  public async broadcastToPeer(
    peerId: string,
    content: string,
    files: CustomFile[]
  ): Promise<boolean> {
    if (!this.dependencies.hasPeer(peerId)) {
      this.dependencies.logger.warn({
        event: "broadcast_to_peer_skipped_missing_peer",
        context: { peerId },
      });
      return false;
    }

    try {
      await this.sendToPeer(peerId, content, files);
      return true;
    } catch (error) {
      this.dependencies.logger.error({
        event: "broadcast_to_peer_failed",
        context: { error, peerId },
      });
      return false;
    }
  }

  private async sendToPeer(
    peerId: string,
    content: string,
    files: CustomFile[]
  ): Promise<void> {
    await this.dependencies.sendPayloadSnapshot(content, files, peerId);

    // Preserve the pre-extraction compatibility contract: payload snapshots
    // derive hasContent differently, but direct string sends still follow raw
    // truthiness until that behavior is intentionally redesigned.
    if (content) {
      await this.dependencies.sendString(content, peerId);
    }

    if (files.length > 0) {
      await this.dependencies.sendFileMeta(files, peerId);
    }
  }
}
