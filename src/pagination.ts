type PageResult = { data: unknown[] | null; error: { message: string } | null };
// Stable ordering is required at each call site to avoid skipping rows between ranges.
export async function readAllPages<T>(read: (from: number, to: number) => PromiseLike<PageResult>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await read(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []) as T[]);
    if (!data || data.length < size) return rows;
  }
}
