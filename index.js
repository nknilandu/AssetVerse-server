const express = require('express')
const cors = require('cors')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 2031

// middleware
app.use(express.json())
app.use(cors())


app.get('/', (req, res) => {
  res.send('Connected to AssetVerse server')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
