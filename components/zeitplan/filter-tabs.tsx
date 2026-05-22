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
      <TabsList className="w-full h-12 p-1 rounded-full bg-secondary dark:bg-gray-600">
        <TabsTrigger value="all" className="flex-1 h-10 text-sm gap-2 rounded-full dark:text-gray-300 data-[state=active]:bg-card data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-300 dark:data-[state=active]:text-gray-900">
          Alle
        </TabsTrigger>
        <TabsTrigger value="open" className="flex-1 h-10 text-sm gap-2 rounded-full dark:text-gray-300 data-[state=active]:bg-card data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-300 dark:data-[state=active]:text-gray-900">
          Offen
          {openCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
              {openCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="mine" className="flex-1 h-10 text-sm gap-2 rounded-full dark:text-gray-300 data-[state=active]:bg-card data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-300 dark:data-[state=active]:text-gray-900">
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
