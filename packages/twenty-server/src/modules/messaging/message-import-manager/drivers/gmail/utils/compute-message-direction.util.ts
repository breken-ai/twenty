import { isDefined } from 'twenty-shared/utils';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';

export const computeMessageDirection = (
  fromHandle: string,
  connectedAccount: Pick<ConnectedAccountEntity, 'handle' | 'handleAliases'>,
): MessageDirection => {
  const normalizedFromHandle = fromHandle.toLowerCase();

  return [connectedAccount.handle, ...(connectedAccount.handleAliases ?? [])]
    .filter(isDefined)
    .some((handle) => handle.toLowerCase() === normalizedFromHandle)
    ? MessageDirection.OUTGOING
    : MessageDirection.INCOMING;
};
