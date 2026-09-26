import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';

import { BlocklistScope } from 'twenty-shared/types';
import { And, ILike, In, Not, Or } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  BlocklistItemDeleteMessagesJob,
  type BlocklistItemDeleteMessagesJobData,
} from 'src/modules/messaging/blocklist-manager/jobs/messaging-blocklist-item-delete-messages.job';
import { MessagingMessageCleanerService } from 'src/modules/messaging/message-cleaner/services/messaging-message-cleaner.service';

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const BLOCKLIST_ITEM_ID = '44444444-4444-4444-8444-444444444444';

type ParticipantWhereCondition = {
  handle: unknown;
};

describe('BlocklistItemDeleteMessagesJob', () => {
  let job: BlocklistItemDeleteMessagesJob;
  let blocklistRepository: { find: jest.Mock };
  let messageParticipantRepository: { find: jest.Mock };
  let messageChannelRepository: { find: jest.Mock };

  beforeEach(async () => {
    blocklistRepository = { find: jest.fn() };
    messageParticipantRepository = { find: jest.fn().mockResolvedValue([]) };
    messageChannelRepository = { find: jest.fn() };

    const repositoriesByName: Record<string, unknown> = {
      blocklist: blocklistRepository,
      messageParticipant: messageParticipantRepository,
      messageChannelMessageAssociation: {
        find: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlocklistItemDeleteMessagesJob,
        {
          provide: MessagingMessageCleanerService,
          useValue: { cleanOrphanMessagesAndThreads: jest.fn() },
        },
        {
          provide: WorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: (callback: () => unknown) => callback(),
            getRepository: (name: string) => repositoriesByName[name],
          },
        },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: messageChannelRepository,
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    job = await module.resolve(BlocklistItemDeleteMessagesJob);
  });

  const givenAWorkspaceBlocklistItem = (handle: string) => {
    blocklistRepository.find.mockResolvedValue([
      {
        id: BLOCKLIST_ITEM_ID,
        handle,
        scope: BlocklistScope.WORKSPACE,
        workspaceMemberId: null,
      },
    ]);
  };

  const givenAMessageChannel = (handle: string) => {
    messageChannelRepository.find.mockResolvedValue([
      {
        id: 'message-channel-1',
        handle,
        connectedAccount: { handleAliases: [] },
      },
    ]);
  };

  const runJob = () =>
    job.handle({
      workspaceId: WORKSPACE_ID,
      events: [{ recordId: BLOCKLIST_ITEM_ID }],
    } as unknown as BlocklistItemDeleteMessagesJobData);

  const getParticipantWhereCondition = (): ParticipantWhereCondition =>
    messageParticipantRepository.find.mock.calls[0][0].where[0];

  it('should look up participants with the lowercased blocklisted email', async () => {
    // Participant handles are stored lowercased, while blocklist entries are
    // stored as typed.
    givenAWorkspaceBlocklistItem('Bob.Smith@Example.com');
    givenAMessageChannel('john.doe@acme.com');

    await runJob();

    expect(getParticipantWhereCondition().handle).toBe('bob.smith@example.com');
  });

  it('should exclude the channel own handles when their casing differs', async () => {
    // An IMAP handle is stored as typed, so blocklisting its own domain must
    // still keep the account's own participant rows out of the deletion.
    givenAWorkspaceBlocklistItem('@acme.com');
    givenAMessageChannel('John.Doe@Acme.com');

    await runJob();

    expect(getParticipantWhereCondition().handle).toEqual(
      And(
        Or(ILike('%@acme.com'), ILike('%.acme.com')),
        Not(In(['john.doe@acme.com'])),
      ),
    );
  });
});
