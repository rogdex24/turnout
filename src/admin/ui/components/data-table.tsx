import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  /** Unique within a table; it keys the column. */
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** A shadcn Table driven by column definitions. Paging and filtering stay with the caller, which owns the query. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows === undefined && loading ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ) : rows && rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn(onRowClick && "cursor-pointer")} onClick={onRowClick && (() => onRowClick(row))}>
                {columns.map((column) => (
                  <TableCell key={column.header} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center whitespace-normal">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
