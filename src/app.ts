import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'
import { createApiRouter, DEFAULT_UPLOAD_LIMIT_BYTES } from './routes/router.js'

type AppOptions = {
	uploadLimitBytes?: number
}

export function createApp({
	uploadLimitBytes = DEFAULT_UPLOAD_LIMIT_BYTES,
}: AppOptions = {}) {
	const app = express()
	app.use(express.json())
	app.use(createApiRouter(uploadLimitBytes))
	app.use(errorHandler)
	return app
}
