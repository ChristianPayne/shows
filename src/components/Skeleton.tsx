export function SkeletonRow() {
  return <div className="h-[34px]" />;
}

export function SkeletonTableRow({ colSpan = 6 }: { colSpan?: number }) {
  return <tr className="h-[41px]"><td colSpan={colSpan} /></tr>;
}
