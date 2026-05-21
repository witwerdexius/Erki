"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

type FilterTabsProps = {
  filter: "all" | "open" | "mine"
  onFilterChange: (filter: "all" | "open" | "mine") => void
  openCount: number
  myCount: number
}

export function FilterTabs({ filter, onFilterChange, openCount, myCount }: FilterTabsProps) {
  return (
    <Tabs value={filter} onValueChange={(v) => onFilterChange(v as "all" | "open" | "mine")} className="mb-4">
      <TabsList className="w-full h-12 p-1 rounded-full bg-secondary">
        <TabsTrigger value="all" className="flex-1 h-10 text-sm gap-2 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">
          Alle
        </TabsTrigger>
        <TabsTrigger value="open" className="flex-1 h-10 text-sm gap-2 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">
          Offen
          {openCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
              {openCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="mine" className="flex-1 h-10 text-sm gap-2 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">
          Meine
          {myCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
              {myCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
