/**
 * Snapshot Map keys before iterating so cleanup or send operations can mutate
 * the original collection without skipping peers.
 */
export function snapshotPeerIds<T>(collection: Map<string, T>): string[] {
  return Array.from(collection.keys());
}

export async function mapPeerCollection<T, TResult>(
  collection: Map<string, T>,
  mapper: (peerId: string) => Promise<TResult>
): Promise<TResult[]> {
  const peerIds = snapshotPeerIds(collection);
  return Promise.all(peerIds.map((peerId) => mapper(peerId)));
}

export async function cleanupPeerCollection<T>(
  collection: Map<string, T>,
  cleanupPeer: (peerId: string) => Promise<void>
): Promise<void> {
  const peerIds = snapshotPeerIds(collection);
  for (const peerId of peerIds) {
    await cleanupPeer(peerId);
  }
}
