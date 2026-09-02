import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { usePerformCombinedFindManyRecords } from '@/object-record/multiple-objects/hooks/usePerformCombinedFindManyRecords';
import { useMultipleRecordPickerPerformSearch } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

jest.mock('@/object-metadata/hooks/useApolloCoreClient');
jest.mock('@/object-record/hooks/useObjectPermissions');
jest.mock(
  '@/object-record/multiple-objects/hooks/usePerformCombinedFindManyRecords',
);

const createSearchResult = (records: object[]) => ({
  data: {
    search: {
      edges: records.map((node) => ({ node })),
      pageInfo: { endCursor: null, hasNextPage: false },
    },
  },
});

describe('useMultipleRecordPickerPerformSearch', () => {
  it('does not overwrite a selection changed while search is pending', async () => {
    let resolveInitialSearch = (_value: object) => {};
    const initialSearch = new Promise<object>((resolve) => {
      resolveInitialSearch = resolve;
    });
    const query = jest
      .fn()
      .mockReturnValueOnce(initialSearch)
      .mockResolvedValueOnce(
        createSearchResult([
          {
            objectNameSingular: 'person',
            recordId: 'record-id',
          },
        ]),
      );

    jest.mocked(useApolloCoreClient).mockReturnValue({
      query,
    } as unknown as ReturnType<typeof useApolloCoreClient>);
    jest.mocked(useObjectPermissions).mockReturnValue({
      objectPermissionsByObjectMetadataId: {},
    });
    jest.mocked(usePerformCombinedFindManyRecords).mockReturnValue({
      performCombinedFindManyRecords: jest
        .fn()
        .mockResolvedValue({ result: {} }),
    } as unknown as ReturnType<typeof usePerformCombinedFindManyRecords>);

    const store = createStore();
    const instanceId = 'multiple-record-picker-test';
    const morphItemsState =
      multipleRecordPickerPickableMorphItemsComponentState.atomFamily({
        instanceId,
      });
    const selectedMorphItem = {
      isMatchingSearchFilter: true,
      isSelected: true,
      objectMetadataId: 'person-metadata-id',
      recordId: 'record-id',
    };
    const objectMetadataItem = {
      id: 'person-metadata-id',
      nameSingular: 'person',
    } as EnrichedObjectMetadataItem;

    store.set(morphItemsState, [selectedMorphItem]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
    const { result } = renderHook(useMultipleRecordPickerPerformSearch, {
      wrapper,
    });

    let performSearchResult = Promise.resolve();

    act(() => {
      performSearchResult = result.current.performSearch({
        forcePickableMorphItems: [selectedMorphItem],
        forceSearchableObjectMetadataItems: [objectMetadataItem],
        multipleRecordPickerInstanceId: instanceId,
      });
    });

    store.set(morphItemsState, [
      {
        ...selectedMorphItem,
        isSelected: false,
      },
    ]);

    await act(async () => {
      resolveInitialSearch(createSearchResult([]));
      await performSearchResult;
    });

    expect(
      store
        .get(morphItemsState)
        .find(({ recordId }) => recordId === selectedMorphItem.recordId),
    ).toMatchObject({ isSelected: false });
  });
});
