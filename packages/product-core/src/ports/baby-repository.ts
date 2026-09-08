import type { Baby } from '../domain/baby.ts';
import type { BabyId, GroupId } from '../domain/ids.ts';

export type BabyProfileUpdate = Pick<
  Baby,
  'id' | 'groupId' | 'name' | 'birthDate' | 'updatedAt'
>;

export interface BabyRepositoryPort {
  list(groupId: GroupId): Promise<readonly Baby[]>;
  findById(groupId: GroupId, babyId: BabyId): Promise<Baby | undefined>;
  updateProfile(profile: BabyProfileUpdate): Promise<void>;
}
