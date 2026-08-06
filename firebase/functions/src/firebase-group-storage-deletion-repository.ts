import type { GroupStorageDeletionRepository } from './firestore-account-deletion-repository.js';

interface StorageBucket {
  deleteFiles(options: { readonly prefix: string; readonly force: boolean }): Promise<unknown>;
}

export class FirebaseGroupStorageDeletionRepository
implements GroupStorageDeletionRepository {
  constructor(private readonly bucket: StorageBucket) {}

  async deleteGroupFiles(groupId: string): Promise<void> {
    await this.bucket.deleteFiles({
      prefix: `groups/${groupId}/`,
      force: true,
    });
  }
}
