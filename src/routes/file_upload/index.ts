import { Router } from 'express'

const router = Router()

router.post('/', (req, res) => {
	// TODO: Validate and process the uploaded file.
	res.status(501).json({ message: 'File upload is not implemented yet.' })
})

export default router
