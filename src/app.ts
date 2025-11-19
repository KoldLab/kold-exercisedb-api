import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { Home } from './pages/home'
import { Routes } from '#common/types'
import type { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import axios from 'axios'
import { promises as fs } from 'fs'
import path from 'path'
export class App {
  private app: OpenAPIHono
  constructor(routes: Routes[]) {
    this.app = new OpenAPIHono()
    this.initializeApp(routes)
  }
  private async initializeApp(routes: Routes[]) {
    try {
      this.initializeGlobalMiddleware()
      this.initializeRoutes(routes)
      this.initializeSwaggerUI()
      this.initializeRouteFallback()
      this.initializeErrorHandler()
    } catch (error) {
      console.error('Failed to initialize application:', error)
      throw new Error('Failed to initialize application')
    }
  }

  private initializeRoutes(routes: Routes[]) {
    // Register media proxy first to avoid conflicts with OpenAPI routes
    this.initializeMediaProxy()

    routes.forEach((route) => {
      route.initRoutes()
      this.app.route('/api/v1', route.controller)
    })
    this.app.route('/', Home)
    this.initializeHealthRoute()
  }

  private initializeHealthRoute() {
    this.app.get('/health', (c) => {
      return c.json(
        {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        },
        200
      )
    })
  }

  private initializeMediaProxy() {
    // OPTIONS handler for CORS preflight
    this.app.options('/api/v1/media/:filename', (c) => {
      c.res.headers.set('Access-Control-Allow-Origin', '*')
      c.res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
      c.res.headers.set('Access-Control-Allow-Headers', '*')
      return c.body(null, 204)
    })

    // Proxy route for GIFs with CORS headers - serves from local files first, then CDN
    this.app.get('/api/v1/media/:filename', async (c) => {
      const filename = c.req.param('filename')

      // Validate filename to prevent path traversal
      if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.gif')) {
        return c.json({ success: false, message: 'Invalid filename' }, 400)
      }

      // Set CORS headers
      c.res.headers.set('Access-Control-Allow-Origin', '*')
      c.res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
      c.res.headers.set('Access-Control-Allow-Headers', '*')
      c.res.headers.set('Content-Type', 'image/gif')
      c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable')

      // Try to serve from local media folder first
      const mediaPath = path.resolve(process.cwd(), 'media', filename)
      try {
        const fileData = await fs.readFile(mediaPath)
        return c.body(fileData)
      } catch (localError: any) {
        // File doesn't exist locally, try CDN
        if (localError.code !== 'ENOENT') {
          console.error('Error reading local file:', localError.message)
        }

        try {
          const cdnUrl = `https://v1.cdn.exercisedb.dev/media/${filename}`
          const response = await axios.get(cdnUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })

          if (response.status !== 200) {
            return c.json({ success: false, message: 'Media not found' }, 404)
          }

          return c.body(response.data)
        } catch (cdnError: any) {
          console.error('Error fetching from CDN:', cdnError.message)
          return c.json({ success: false, message: 'Media not found' }, 404)
        }
      }
    })
  }

  private initializeGlobalMiddleware() {
    this.app.use(
      cors({
        origin: '*',
        allowMethods: ['GET', 'OPTIONS']
      })
    )

    this.app.use(logger())
    this.app.use(prettyJSON())
    this.app.use(async (c, next) => {
      const start = Date.now()
      await next()
      const end = Date.now()
      c.res.headers.set('X-Response-Time', `${end - start}ms`)
    })

    // this.app.use(authMiddleware)
  }

  private initializeSwaggerUI(): void {
    // OpenAPI documentation for v1
    this.app.doc31('/swagger', (c) => {
      const { protocol: urlProtocol, hostname, port } = new URL(c.req.url)
      const protocol = c.req.header('x-forwarded-proto') ? `${c.req.header('x-forwarded-proto')}:` : urlProtocol

      return {
        openapi: '3.1.0',
        info: {
          version: '1.0.0',
          title: 'ExerciseDB API - v1 (Open Source)',
          description: `**ExerciseDB API v1** is a fully open-source and developer-friendly fitness exercise database featuring over 1,500 structured exercises with **GIF-based visual media**. It includes detailed metadata like target muscles, equipment, and body parts, designed for fast integration into fitness apps, personal trainer platforms, and health tools.

**📝 NOTE**: This version is public, free to use, and includes both the **code and dataset metadata** — making it perfect for personal projects, prototypes, learning, and community-driven apps.

🔗 Useful Links:
- 💬 Need full v1 Dataset access: [Download Now](https://dub.sh/v1_plans)
- 🚀 Explore our new v2 dataset: [v2.exercisedb.dev](https://v2.exercisedb.dev)
- 🌐 Official Website: [exercisedb.dev](https://exercisedb.dev)`
        },
        servers: [
          {
            url: `${protocol}//${hostname}${port ? `:${port}` : ''}`,
            description:
              'v1 Dataset (Open Source)\n• Public & open license\n• Code and metadata available on GitHub\n• GIF-based media\n• Ideal for demos, personal apps, and learning\n• chat support for full dataset access'
          }
        ]
      }
    })

    // API Documentation UI
    this.app.get(
      '/docs',
      Scalar({
        pageTitle: 'ExerciseDB API - v1 (Open Source)',
        theme: 'kepler',
        isEditable: false,
        layout: 'modern',
        darkMode: true,
        hideDownloadButton: true,
        hideDarkModeToggle: true,
        url: '/swagger',
        favicon: 'https://cdn.exercisedb.dev/exercisedb/favicon.ico',
        defaultOpenAllTags: true,
        hideClientButton: true,
        metaData: {
          applicationName: 'ExerciseDB API - v1',
          author: 'Ascend API',
          creator: 'Ascend API',
          publisher: 'Ascend API',
          ogType: 'website',
          robots: 'index follow',
          description: `**ExerciseDB API v1** is a fully open-source exercise dataset offering 1,300+ exercises with rich metadata and GIF visualizations. Built for speed and ease of use, it's ideal for personal projects, prototypes, and education.

🔗 Useful Links:
- 💬 Chat with us for full GIF access: [Telegram](https://t.me/exercisedb)
- 🚀 Explore our new v2 dataset: [v2.exercisedb.dev](https://v2.exercisedb.dev)
- 🌐 Official Website: [exercisedb.dev](https://exercisedb.dev)`
        }
      })
    )
  }

  private initializeRouteFallback() {
    this.app.notFound((c) => {
      return c.json(
        {
          success: false,
          message: 'route not found!!. check docs at https://v1.exercisedb.dev/docs'
        },
        404
      )
    })
  }
  private initializeErrorHandler() {
    this.app.onError((err, c) => {
      const error = err as HTTPException
      console.log(error)
      return c.json({ success: false, message: error.message }, error.status || 500)
    })
  }
  public getApp() {
    return this.app
  }
}
