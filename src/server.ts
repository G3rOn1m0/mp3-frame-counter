import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'
import router from './routes/router.js'

const app = express()
app.use(express.json())
app.use('/api', router)
app.use(errorHandler)

app.listen(3000, () => {
	console.log('Server is running on port 3000')
})
