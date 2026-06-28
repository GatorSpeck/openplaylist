export const parseDateKey = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const sortAnniversaryGroups = <T extends { anniversary_date: string }>(items: T[]) => {
  const grouped: Record<string, T[]> = {};

  items.forEach(item => {
    const date = item.anniversary_date;
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(item);
  });

  return Object.entries(grouped).sort(([a], [b]) => parseDateKey(a).getTime() - parseDateKey(b).getTime());
};

export const flattenAnniversaryGroups = <T>(groups: Array<[string, T[]]>) =>
  groups.flatMap(([, groupItems]) => groupItems);

export const mergeAnniversaryGroups = <T extends { id: number; anniversary_date: string }>(
  existing: T[],
  incoming: T[],
  direction: 'past' | 'future',
) => {
  const combined = direction === 'past' ? [...incoming, ...existing] : [...existing, ...incoming];
  const unique = combined.filter((item, index, self) =>
    index === self.findIndex(candidate => candidate.id === item.id && candidate.anniversary_date === item.anniversary_date)
  );

  return flattenAnniversaryGroups(sortAnniversaryGroups(unique));
};
