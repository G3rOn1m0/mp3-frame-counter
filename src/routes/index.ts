import fileUploadRouter from './file_upload/index.js'
import { Router } from 'express'

const router = Router()

router.use('/file_upload', fileUploadRouter)

export default router
