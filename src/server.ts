import { serve } from '@hono/node-server'
import { BodyPartController, EquipmentController, ExerciseController, MuscleController } from './modules'
import { App } from './app'

const app = new App([
  new ExerciseController(),
  new MuscleController(),
  new EquipmentController(),
  new BodyPartController()
]).getApp()

const port = Number(process.env.PORT) || 3000

console.log(`🚀 Server is running on http://localhost:${port}`)
console.log(`📚 API Documentation: http://localhost:${port}/docs`)
console.log(`🔍 Swagger JSON: http://localhost:${port}/swagger`)

serve({
  fetch: app.fetch,
  port
})
