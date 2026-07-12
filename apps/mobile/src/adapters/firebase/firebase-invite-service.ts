import {
  httpsCallable,
  type Functions,
  type HttpsCallable,
} from '@react-native-firebase/functions';
import type {
  AuthPort,
  CareGroupInvite,
  InviteServicePort,
  Membership,
} from '@babycare/product-core';

import {
  decodeAcceptInviteResult,
  decodeCreateInviteResult,
} from './invite-callable-results';

interface CreateInviteRequest {
  readonly groupId: string;
}

interface AcceptInviteRequest {
  readonly code: string;
  readonly displayName: string;
}

export class FirebaseInviteService implements InviteServicePort {
  readonly #auth: AuthPort;
  readonly #create: HttpsCallable<CreateInviteRequest, unknown>;
  readonly #accept: HttpsCallable<AcceptInviteRequest, unknown>;

  constructor(functions: Functions, auth: AuthPort) {
    this.#auth = auth;
    this.#create = httpsCallable<CreateInviteRequest, unknown>(functions, 'createInvite');
    this.#accept = httpsCallable<AcceptInviteRequest, unknown>(functions, 'acceptInvite');
  }

  async createInvite(
    input: Parameters<InviteServicePort['createInvite']>[0],
  ): Promise<CareGroupInvite> {
    const identity = await this.#auth.currentUser();
    if (!identity || identity.userId !== input.requestedBy) {
      throw new Error('Authenticated user does not match the invite requester');
    }
    const response = await this.#create({groupId: input.groupId});
    return decodeCreateInviteResult({
      value: response.data,
      requestedBy: input.requestedBy,
      expectedGroupId: input.groupId,
    });
  }

  async acceptInvite(
    input: Parameters<InviteServicePort['acceptInvite']>[0],
  ): Promise<Membership> {
    const identity = await this.#auth.currentUser();
    if (!identity || identity.userId !== input.userId) {
      throw new Error('Authenticated user does not match the invite recipient');
    }
    const response = await this.#accept({
      code: input.code,
      displayName: input.displayName,
    });
    return decodeAcceptInviteResult({
      value: response.data,
      expectedUserId: input.userId,
    });
  }
}
