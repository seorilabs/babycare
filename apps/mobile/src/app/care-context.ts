import type {
  AuthIdentity,
  Baby,
  CareGroup,
  Membership,
} from '@babycare/product-core';

export interface AuthenticatedCareContext {
  readonly identity: AuthIdentity;
  readonly membership: Membership;
  readonly group: CareGroup;
  readonly baby: Baby;
}

export function assertAuthenticatedCareContext(
  context: AuthenticatedCareContext,
): void {
  if (context.identity.userId !== context.membership.userId) {
    throw new Error('Authenticated identity does not match the membership');
  }
  if (
    context.membership.groupId !== context.group.id ||
    context.baby.groupId !== context.group.id
  ) {
    throw new Error('Membership, group, and baby do not share one group');
  }
  if (!context.group.babyIds.includes(context.baby.id)) {
    throw new Error('Selected baby is not declared by the care group');
  }
}
