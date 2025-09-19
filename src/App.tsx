import React, { useMemo, useState } from 'react'
import {
  Box, Heading, Link, PageHeader, Spinner, Text, Flash
} from '@primer/react'
import {
  Button, ButtonGroup, FormControl, TextInput, Select, Label, Card, Section, SectionIntro
} from '@primer/react-brand'
import type { Repository, SearchFilters, SearchResponse, SearchState } from './types'

const initialFilters: SearchFilters = {
  query: '',
  user: '',
  org: '',
  language: '',
  created: '',
  pushed: '',
  size: '',
  stars: '',
  forks: '',
  topics: '',
  license: '',
  is: '',
  archived: '',
  fork: '',
  sort: '',
  order: 'desc',
}

function buildQueryParams(filters: SearchFilters) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  return params
}

type SearchInputProps = {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  name: keyof SearchFilters
  onEnter?: () => void
}

const SearchInput = ({ label, value, onChange, placeholder, name, onEnter }: SearchInputProps) => (
  <FormControl>
    <FormControl.Label>{label}</FormControl.Label>
    <TextInput
      name={name}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && onEnter) onEnter()
      }}
      placeholder={placeholder}
    />
  </FormControl>
)

type SearchSelectProps = {
  label: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  name: keyof SearchFilters
}

const SearchSelect = ({ label, value, onChange, options, name }: SearchSelectProps) => (
  <FormControl>
    <FormControl.Label>{label}</FormControl.Label>
    <Select name={name} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(opt => (
        <Select.Option key={opt.value} value={opt.value}>
          {opt.label}
        </Select.Option>
      ))}
    </Select>
  </FormControl>
)

function RepoCard({ repo }: { repo: Repository }) {
  // Create a concise description with metadata
  const metadata = [
    `★ ${repo.stargazers_count}`,
    `⑂ ${repo.forks_count}`,
    `Created ${new Date(repo.created_at).toISOString().slice(0, 10)}`,
    `Updated ${new Date(repo.updated_at).toISOString().slice(0, 10)}`
  ].join(' • ')

  const description = repo.description
    ? `${repo.description} • ${metadata}`
    : metadata

  // Create labels for language, topics, and license
  const labels = []
  if (repo.language) labels.push(repo.language)
  if (repo.topics) labels.push(...repo.topics.slice(0, 3))
  if (repo.license?.name) labels.push(repo.license.name)

  const label = labels.length > 0 ? labels[0] : undefined

  return (
    <Card
      href={repo.html_url}
      heading={repo.full_name}
      description={description}
      label={label}
      ctaText="View on GitHub"
    />
  )
}

interface CacheEntry {
  filters: Omit<SearchFilters, 'sort' | 'order'>
  allResults: Repository[]
  totalCount: number
  timestamp: number
  rateLimit: any
  status: number | null
  incompleteResults: boolean
}

export default function App() {
  const [filters, setFilters] = useState<SearchFilters>(initialFilters)
  const [state, setState] = useState<SearchState>({
    results: [], loading: false, error: null, totalCount: 0,
    status: null, rateLimit: null, incompleteResults: false,
  })
  const [cache, setCache] = useState<CacheEntry | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const canUseCache = useMemo(() => {
    if (!cache) return false
    const now = Date.now()
    const thirtyMinutes = 30 * 60 * 1000
    if (now - cache.timestamp >= thirtyMinutes) return false
    const current = { ...filters }; delete (current as any).sort; delete (current as any).order
    return JSON.stringify(current) === JSON.stringify(cache.filters)
  }, [cache, filters])

  const processedResults = useMemo(() => {
    if (!canUseCache || !cache) return []
    const results = [...cache.allResults]
    if (filters.sort) {
      results.sort((a, b) => {
        let aVal: number; let bVal: number
        switch (filters.sort) {
          case 'stars': aVal = a.stargazers_count; bVal = b.stargazers_count; break
          case 'forks': aVal = a.forks_count; bVal = b.forks_count; break
          case 'updated': aVal = new Date(a.updated_at).getTime(); bVal = new Date(b.updated_at).getTime(); break
          case 'created': aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); break
          default: return 0
        }
        return filters.order === 'asc' ? aVal - bVal : bVal - aVal
      })
    }
    return results
  }, [canUseCache, cache, filters.sort, filters.order])

  function updateFilter<K extends keyof SearchFilters>(key: K, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const performSearch = async () => {
    if (canUseCache && cache) {
      setState({
        results: processedResults,
        loading: false,
        error: null,
        totalCount: cache.totalCount,
        status: cache.status,
        rateLimit: cache.rateLimit,
        incompleteResults: cache.incompleteResults,
      })
      setHasSearched(true)
      return
    }

    const controller = new AbortController()
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const params = buildQueryParams(filters)
      const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      const status = res.status
      const json: SearchResponse = await res.json()

      if (!res.ok) {
        throw new Error(`HTTP ${status}: ${json?.error || 'Request failed'}`)
      }

      const allResults = json.items || []
      const searchFilters = { ...filters }
      delete (searchFilters as any).sort
      delete (searchFilters as any).order

      setCache({
        filters: searchFilters,
        allResults,
        totalCount: json.total_count || 0,
        timestamp: Date.now(),
        rateLimit: json.rate_limit,
        status,
        incompleteResults: json.incomplete_results || false,
      })

      setState({
        results: allResults,
        loading: false,
        error: null,
        totalCount: json.total_count || 0,
        status,
        rateLimit: json.rate_limit,
        incompleteResults: json.incomplete_results || false,
      })
      setHasSearched(true)
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e.message || 'Search failed' }))
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', fontFamily: 'mono' }}>
      <PageHeader>
        <PageHeader.TitleArea>
          <Heading as="h1">GitHub Repository Explorer</Heading>
          <Text sx={{ fontSize: 1, color: 'fg.muted', mt: 1 }}>
            Advanced GitHub repository search with caching and filters
          </Text>
        </PageHeader.TitleArea>
        <PageHeader.Actions>
          {(state.status || state.rateLimit) && (
            <Box sx={{ textAlign: 'right' }}>
              <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                {state.status && `Status: ${state.status}${state.incompleteResults ? ' (incomplete)' : ''}`}
              </Text>
              {state.rateLimit && (
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  Rate Limit: {state.rateLimit.remaining}/{state.rateLimit.limit}
                </Text>
              )}
            </Box>
          )}
        </PageHeader.Actions>
      </PageHeader>

      <Box as="main">
        <Section>
          <SectionIntro align="center">
            <SectionIntro.Heading size="3">Search Filters</SectionIntro.Heading>
            <SectionIntro.Description>
              Use the advanced filters below to find repositories on GitHub. Enter search criteria and click "Search" to explore.
            </SectionIntro.Description>
          </SectionIntro>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 4,
              mt: 6,
              mb: 4
            }}
          >
            <SearchInput label="Query" name="query" value={filters.query} placeholder="e.g. cache OR search in:name" onChange={v => updateFilter('query', v)} onEnter={performSearch} />
            <SearchInput label="User" name="user" value={filters.user} placeholder="e.g. torvalds" onChange={v => updateFilter('user', v)} onEnter={performSearch} />
            <SearchInput label="Org" name="org" value={filters.org} placeholder="e.g. NVIDIA" onChange={v => updateFilter('org', v)} onEnter={performSearch} />
            <SearchInput label="Language" name="language" value={filters.language} placeholder="e.g. typescript" onChange={v => updateFilter('language', v)} onEnter={performSearch} />
            <SearchInput label="Created" name="created" value={filters.created} placeholder=">=2024-01-01" onChange={v => updateFilter('created', v)} onEnter={performSearch} />
            <SearchInput label="Pushed" name="pushed" value={filters.pushed} placeholder=">=2025-01-01" onChange={v => updateFilter('pushed', v)} onEnter={performSearch} />
            <SearchInput label="Size" name="size" value={filters.size} placeholder=">1000" onChange={v => updateFilter('size', v)} onEnter={performSearch} />
            <SearchInput label="Stars" name="stars" value={filters.stars} placeholder=">=100" onChange={v => updateFilter('stars', v)} onEnter={performSearch} />
            <SearchInput label="Forks" name="forks" value={filters.forks} placeholder=">=10" onChange={v => updateFilter('forks', v)} onEnter={performSearch} />
            <SearchInput label="Topics" name="topics" value={filters.topics} placeholder="ml,rl,vision" onChange={v => updateFilter('topics', v)} onEnter={performSearch} />
            <SearchInput label="License" name="license" value={filters.license} placeholder="apache-2.0" onChange={v => updateFilter('license', v)} onEnter={performSearch} />
            <SearchInput label="Is" name="is" value={filters.is} placeholder="public OR private" onChange={v => updateFilter('is', v)} onEnter={performSearch} />
            <SearchInput label="Archived" name="archived" value={filters.archived} placeholder="true OR false" onChange={v => updateFilter('archived', v)} onEnter={performSearch} />
            <SearchInput label="Fork" name="fork" value={filters.fork} placeholder="true OR only" onChange={v => updateFilter('fork', v)} onEnter={performSearch} />
            <SearchSelect
              label="Sort"
              name="sort"
              value={filters.sort}
              onChange={v => updateFilter('sort', v as SearchFilters['sort'])}
              options={[
                { label: 'Best match', value: '' },
                { label: 'Stars', value: 'stars' },
                { label: 'Forks', value: 'forks' },
                { label: 'Help wanted', value: 'help-wanted-issues' },
                { label: 'Updated', value: 'updated' },
                { label: 'Created', value: 'created' },
              ]}
            />
            <SearchSelect
              label="Order"
              name="order"
              value={filters.order}
              onChange={v => updateFilter('order', v as SearchFilters['order'])}
              options={[
                { label: 'Desc', value: 'desc' },
                { label: 'Asc', value: 'asc' },
              ]}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', mt: 4 }}>
            <ButtonGroup size="large">
              <Button variant="primary" onClick={performSearch} disabled={state.loading}>
                {state.loading ? 'Searching...' : 'Search'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setFilters(initialFilters)
                  setState(s => ({ ...s, results: [], totalCount: 0, error: null, status: null }))
                  setCache(null)
                  setHasSearched(false)
                }}
              >
                Clear
              </Button>
            </ButtonGroup>
            {state.error && (
              <Flash variant="danger" sx={{ fontSize: 1, maxWidth: '600px' }}>
                Error: {state.error}
              </Flash>
            )}
          </Box>
        </Section>

        <Section backgroundColor="subtle">
          <SectionIntro align="center">
            <SectionIntro.Heading size="3">Search Results</SectionIntro.Heading>
            {hasSearched && (
              <SectionIntro.Description>
                Found {state.totalCount} repositories
                {canUseCache && <Text as="span" sx={{ color: 'accent.fg' }}> • Using cached data</Text>}
              </SectionIntro.Description>
            )}
          </SectionIntro>

          {state.loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, py: 6 }}>
              <Spinner size="small" />
              <Text>Loading…</Text>
            </Box>
          )}
          {!state.loading && !hasSearched && (
            <Box sx={{ textAlign: 'center', py: 6, px: 4, color: 'fg.muted' }}>
              <Text sx={{ fontSize: 2 }}>Configure your search filters above and click "Search" to find repositories.</Text>
            </Box>
          )}
          {!state.loading && hasSearched && state.results.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Text sx={{ color: 'fg.muted' }}>
                No results found. Try adjusting your search criteria.
              </Text>
            </Box>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 4, mt: 4 }}>
            {state.results.map(r => <RepoCard key={r.id} repo={r} />)}
          </Box>
        </Section>
      </Box>

      <Box as="footer" sx={{ borderTop: '1px solid', borderColor: 'border.default', p: 3, fontSize: 1, color: 'fg.muted', textAlign: 'center' }}>
        • Uses GitHub Search API via backend • Displays HTTP status and rate-limit headers • Primer React UI •
      </Box>
    </Box>
  )
}
