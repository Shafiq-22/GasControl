interface Page<T> { data: T[] | null; error: { message: string } | null }

/** Continue until an empty page, including when the API caps pages below our request. */
export async function readAllRows<T>(
  table: string,
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + 499);
    if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
    if (!data) throw new Error(`Unable to load ${table}: no result returned`);
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}
