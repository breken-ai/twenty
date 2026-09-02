import { useMultipleRecordPickerPerformSearch } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const mockQuery = jest.fn();
const mockPerformCombinedFindManyRecords = jest.fn();

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ query: mockQuery }),
}));
jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));
jest.mock(
  '@/object-record/multiple-objects/hooks/usePerformCombinedFindManyRecords',
  () => ({
    usePerformCombinedFindManyRecords: () => ({
      performCombinedFindManyRecords: mockPerformCombinedFindManyRecords,
    }),
  }),
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
    const objectMetadataItem = getMockObjectMetadataItemOrThrow('person');
    let resolveInitialSearch = (_value: object) => {};
    const initialSearch = new Promise<object>((resolve) => {
      resolveInitialSearch = resolve;
    });
    mockQuery.mockReturnValueOnce(initialSearch).mockResolvedValueOnce(
      createSearchResult([
        {
          objectNameSingular: objectMetadataItem.nameSingular,
          recordId: 'record-id',
        },
      ]),
    );
    mockPerformCombinedFindManyRecords.mockResolvedValue({ result: {} });

    const store = createStore();
    const instanceId = 'multiple-record-picker-test';
    const morphItemsState =
      multipleRecordPickerPickableMorphItemsComponentState.atomFamily({
        instanceId,
      });
    const selectedMorphItem = {
      isMatchingSearchFilter: true,
      isSelected: true,
      objectMetadataId: objectMetadataItem.id,
      recordId: 'record-id',
    };

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
