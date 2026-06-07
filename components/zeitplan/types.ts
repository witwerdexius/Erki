export type Task = {
  id: string
  name: string
  slots: number
  filled: number
  volunteers: string[]
  isAuto?: boolean
  time?: string
  symbol?: string
}

export type Phase = {
  id: string
  name: string
  description: string
  time: string
  tasks: Task[]
}
