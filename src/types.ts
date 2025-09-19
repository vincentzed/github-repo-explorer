export interface Repository {
  id: number
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  topics?: string[]
  license?: { name: string } | null
  created_at: string
  updated_at: string
  stargazers_count: number
  forks_count: number
}

export interface SearchFilters {
  query: string
  user: string
  org: string
  language: string
  created: string
  pushed: string
  size: string
  stars: string
  forks: string
  topics: string
  license: string
  is: string
  archived: string
  fork: string
  sort: '' | 'stars' | 'forks' | 'help-wanted-issues' | 'updated' | 'created'
  order: 'asc' | 'desc'
}

export interface SearchResponse {
  status: number
  rate_limit: { limit: number; remaining: number; reset: number } | null
  total_count: number
  incomplete_results: boolean
  items: Repository[]
  error?: string
}

export interface SearchState {
  results: Repository[]
  loading: boolean
  error: string | null
  totalCount: number
  status: number | null
  rateLimit: SearchResponse['rate_limit'] | null
  incompleteResults: boolean
}