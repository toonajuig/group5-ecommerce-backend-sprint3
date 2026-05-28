import express from 'express'
import cors from 'cors'
import apiRouter from './routes/apiRoutes/apiRoutes.js'

const app = express()
const PORT = 3000;




app.use(cors())

app.use(express.json())

app.use("/api",apiRouter) //รอเชื่อมต่อกับ routes 


app.use("error",(err,req,res,next) => {}) //ดักจับ error

app.listen(PORT, ()=> {console.log(`This server is running on port ${PORT}`)})