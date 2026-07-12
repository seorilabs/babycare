import type { Baby } from '../domain/baby.ts';
import type { BabyId, GroupId } from '../domain/ids.ts';

export interface BabyRepositoryPort {
  list(groupId: GroupId): Promise<readonly Baby[]>;
  findById(groupId: GroupId, babyId: BabyId): Promise<Baby | undefined>;
  save(baby: Baby): Promise<void>;
}
