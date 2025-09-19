import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Octokit } from '@octokit/rest'

const app = express()
app.use(cors())
app.use(express.json())

const port = Number(process.env.PORT) || 3001

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || undefined,
  userAgent: 'github-repo-explorer/1.0.0',
})

function buildSearchQuery(params: Record<string, string | undefined>) {
  const {
    query, user, org, language, created, pushed, size, stars, forks,
    topics, license, is, archived, fork
  } = params

  const parts: string[] = []

  if (query) parts.push(query)
  if (user) parts.push(`user:${user}`)
  if (org) parts.push(`org:${org}`)
  if (language) parts.push(`language:${language}`)
  if (created) parts.push(`created:${created}`)
  if (pushed) parts.push(`pushed:${pushed}`)
  if (size) parts.push(`size:${size}`)
  if (stars) parts.push(`stars:${stars}`)
  if (forks) parts.push(`forks:${forks}`)

  if (topics) {
    topics.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
      parts.push(`topic:${t}`)
    })
  }

  if (license) parts.push(`license:${license}`)
  if (is) parts.push(`is:${is}`)
  if (archived) parts.push(`archived:${archived}`)
  if (fork) parts.push(`fork:${fork}`)

  return parts.join(' ')
}

async function fetchAllPages(searchQuery: string, sort?: string, order?: string) {
  const perPage = 100
  const maxPages = 10

  const headers = {
    accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  } as const

  let totalCount = 0
  let incompleteResults = false
  const items: any[] = []

  for (let page = 1; page <= maxPages; page++) {
    const params: any = {
      q: searchQuery,
      order,
      per_page: perPage,
      page
    }
    if (sort && sort !== 'created' && sort !== '') {
      params.sort = sort
    }

    const resp = await octokit.rest.search.repos(params, {
      headers
    })

    if (page === 1) {
      totalCount = resp.data.total_count
      incompleteResults = resp.data.incomplete_results
    }

    items.push(...resp.data.items)

    if (!resp.data.items || resp.data.items.length < perPage) {
      break
    }
  }

  if (sort === 'created') {
    items.sort((a, b) => {
      const aT = new Date(a.created_at).getTime()
      const bT = new Date(b.created_at).getTime()
      return (order === 'asc' ? aT - bT : bT - aT)
    })
  }

  return { totalCount, incompleteResults, items }
}

app.get('/api/search', async (req, res) => {
  try {
    const {
      query, user, org, language, created, pushed, size, stars, forks,
      topics, license, is, archived, fork, sort = '', order = 'desc'
    } = req.query as Record<string, string | undefined>

    const q = buildSearchQuery({
      query, user, org, language, created, pushed, size, stars, forks,
      topics, license, is, archived, fork
    })

    if (!q) {
      res.status(400).json({ error: 'Search query is required', status: 400 })
      return
    }

    const { totalCount, incompleteResults, items } = await fetchAllPages(q, sort, order)

    const trimmed = items.map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      html_url: r.html_url,
      description: r.description,
      language: r.language,
      topics: r.topics,
      license: r.license ? { name: r.license.name } : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
    }))

    let rateLimit: any = null
    try {
      const rl = await octokit.rest.rateLimit.get()
      rateLimit = {
        limit: rl.data.rate.limit,
        remaining: rl.data.rate.remaining,
        reset: rl.data.rate.reset
      }
    } catch {
      // ignore
    }

    res.status(200).json({
      status: 200,
      rate_limit: rateLimit,
      total_count: totalCount,
      incomplete_results: incompleteResults,
      items: trimmed
    })
  } catch (err: any) {
    const message = err?.message || 'Internal server error'
    const status = typeof err?.status === 'number' ? err.status : 500
    res.status(status).json({ error: message, status })
  }
})

const server = app.listen(port, () => {
  console.log(`GitHub Repository Explorer API running at http://localhost:${port}`)
})

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing process or set PORT to a different value.`)
    process.exit(1)
  } else {
    console.error('Server error:', err)
    process.exit(1)
  }
})

export default app