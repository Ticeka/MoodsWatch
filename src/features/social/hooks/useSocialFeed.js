import { useQuery } from '@tanstack/react-query';
import { fetchPostsFeed, fetchSocialActivityFeed } from '@/features/social/api/socialApi';
import { getTitlesByIds } from '@/features/discover/lib/recommend';

// staleTime: 60s — social feed เปลี่ยนบ้าง แต่ไม่ต้อง fresh ทุกครั้ง
export function useSocialPostsFeed(userId) {
  return useQuery({
    queryKey: ['social-posts-feed', userId],
    queryFn: async () => {
      const feed = await fetchPostsFeed(userId, 20, 0);
      const titleIds = [...new Set(feed.map((p) => p.title_id).filter(Boolean))];
      const titles = titleIds.length ? await getTitlesByIds(titleIds) : [];
      const titleMap = new Map(titles.map((t) => [Number(t.id), t]));
      return { feed, titleMap };
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

// staleTime: 60s — activity feed เปลี่ยนตาม action ของ following
export function useSocialActivityFeed(userId) {
  return useQuery({
    queryKey: ['social-activity-feed', userId],
    queryFn: async () => {
      const feed = await fetchSocialActivityFeed(userId, 40);
      const titleIds = [...new Set(feed.map((i) => i.title_id).filter(Boolean))];
      const titles = titleIds.length ? await getTitlesByIds(titleIds) : [];
      const titleMap = new Map(titles.map((t) => [Number(t.id), t]));
      return { feed, titleMap };
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
