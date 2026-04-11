import { Medal } from 'lucide-react';

export function getTierListProgressMedal(tierList, pick) {
  const rankedCount = Number((tierList?.rows || []).reduce((sum, row) => sum + Number(row?.titleIds?.length || 0), 0));
  const totalCount = rankedCount + Number(tierList?.poolTitleIds?.length || 0);

  if (totalCount <= 0 || rankedCount <= 0) {
    return null;
  }

  const ratio = rankedCount / totalCount;
  if (ratio >= 1) {
    return {
      key: 'gold',
      label: pick('เหรียญทอง', 'Gold Medal'),
      description: pick(`จัดครบ ${rankedCount}/${totalCount} รายการแล้ว`, `Ranked all ${rankedCount}/${totalCount} items`),
      icon: Medal,
    };
  }

  if (ratio >= 0.6) {
    return {
      key: 'silver',
      label: pick('เหรียญเงิน', 'Silver Medal'),
      description: pick(`จัดแล้ว ${rankedCount}/${totalCount} รายการ`, `Ranked ${rankedCount}/${totalCount} items`),
      icon: Medal,
    };
  }

  return {
    key: 'bronze',
    label: pick('เหรียญบรอนซ์', 'Bronze Medal'),
    description: pick(`เริ่มจัดแล้ว ${rankedCount}/${totalCount} รายการ`, `Started ranking ${rankedCount}/${totalCount} items`),
    icon: Medal,
  };
}
