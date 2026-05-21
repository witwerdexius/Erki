export type Task = {
  id: string
  name: string
  slots: number
  filled: number
  volunteers: string[]
  isAuto?: boolean
}

export type Phase = {
  id: string
  name: string
  description: string
  time: string
  tasks: Task[]
}
