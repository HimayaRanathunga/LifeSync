import { useCallback, useEffect, useState } from 'react';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { Page } from '../services/logsService';

type Cursor = QueryDocumentSnapshot<DocumentData> | null;
type FetchPage<T> = (pageSize: number, cursor: Cursor) => Promise<Page<T>>;

const PAGE_SIZE = 10;

/**
 * Drives a "load more" list backed by cursor-paginated Firestore reads (see fetchHealthLogsPage
 * etc.) — used by every history list (habits/health/food) so the pagination UX and loading
 * states are consistent instead of three separate hand-rolled implementations.
 */
export function usePaginatedList<T>(uid: string | undefined, fetchPage: FetchPage<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const loadFirstPage = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const page = await fetchPage(PAGE_SIZE, null);
    setItems(page.items);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setLoading(false);
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const loadMore = useCallback(async () => {
    if (!uid || loading || !hasMore) return;
    setLoading(true);
    const page = await fetchPage(PAGE_SIZE, cursor);
    setItems((prev) => [...prev, ...page.items]);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, cursor, hasMore, loading]);

  useEffect(() => {
    if (uid && !initialized) loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /**
   * Pages forward (reusing the same cursor-paginated fetch loadMore uses) until an already- or
   * newly-loaded item satisfies `predicate`, `hasMore` goes false, or `maxPages` is hit — powers
   * client-side date filtering (DateStrip) without a new date-scoped Firestore query. Does not
   * reset the list; already-loaded items are checked first.
   */
  const loadUntil = useCallback(
    async (predicate: (item: T) => boolean, maxPages = 5): Promise<'found' | 'exhausted' | 'capped'> => {
      if (!uid) return 'exhausted';
      if (items.some(predicate)) return 'found';

      let localCursor = cursor;
      let localHasMore = hasMore;
      let pagesFetched = 0;
      setLoading(true);
      while (localHasMore && pagesFetched < maxPages) {
        const page = await fetchPage(PAGE_SIZE, localCursor);
        setItems((prev) => [...prev, ...page.items]);
        localCursor = page.cursor;
        localHasMore = page.hasMore;
        pagesFetched += 1;
        setCursor(localCursor);
        setHasMore(localHasMore);
        if (page.items.some(predicate)) {
          setLoading(false);
          return 'found';
        }
      }
      setLoading(false);
      return localHasMore ? 'capped' : 'exhausted';
    },
    [uid, cursor, hasMore, fetchPage, items]
  );

  return { items, loading, hasMore, loadMore, loadUntil, refresh: loadFirstPage };
}
