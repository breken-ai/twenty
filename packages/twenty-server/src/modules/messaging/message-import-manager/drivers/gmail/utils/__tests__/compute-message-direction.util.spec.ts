import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { computeMessageDirection } from 'src/modules/messaging/message-import-manager/drivers/gmail/utils/compute-message-direction.util';

describe('computeMessageDirection', () => {
  it('should mark a message sent from the account handle as outgoing', () => {
    expect(
      computeMessageDirection('adele.vance@contoso.com', {
        handle: 'adele.vance@contoso.com',
        handleAliases: [],
      }),
    ).toBe(MessageDirection.OUTGOING);
  });

  it('should mark a message from someone else as incoming', () => {
    expect(
      computeMessageDirection('megan@fabrikam.com', {
        handle: 'adele.vance@contoso.com',
        handleAliases: [],
      }),
    ).toBe(MessageDirection.INCOMING);
  });

  it('should ignore case when matching the account handle', () => {
    // Microsoft Graph returns the sender address with its Exchange casing,
    // while the handle is stored lowercased.
    expect(
      computeMessageDirection('Adele.Vance@Contoso.com', {
        handle: 'adele.vance@contoso.com',
        handleAliases: [],
      }),
    ).toBe(MessageDirection.OUTGOING);
  });

  it('should ignore case when matching a handle alias', () => {
    expect(
      computeMessageDirection('sales@contoso.com', {
        handle: 'adele.vance@contoso.com',
        handleAliases: ['Sales@Contoso.com'],
      }),
    ).toBe(MessageDirection.OUTGOING);
  });
});
