const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 8080;

const TRAFFIC_FILE = 'mini-cdn.txt';

let totalBytesSent = 0;

// Load traffic data from file on startup
if (fs.existsSync(TRAFFIC_FILE)) {
    totalBytesSent = parseInt(fs.readFileSync(TRAFFIC_FILE, 'utf-8'), 10);
}

// Middleware to track the amount of data sent in response
app.use((req, res, next) => {
    const oldWrite = res.write;
    const oldEnd = res.end;

    const chunks = [];

    res.write = function(chunk) {
        chunks.push(chunk);
        return oldWrite.apply(res, arguments);
    };

    res.end = function(chunk) {
        if (chunk) {
            chunks.push(chunk);
        }
        const totalLength = chunks.reduce((sum, buf) => sum + buf.length, 0);
        totalBytesSent += totalLength;

        // Save traffic data to file
        fs.writeFileSync(TRAFFIC_FILE, totalBytesSent.toString());

        oldEnd.apply(res, arguments);
    };

    next();
});

app.get('/stats', (req, res) => {
    res.json({
        totalBytesSent
    });
});

const STATIC_DIR = path.join(__dirname, 'static');
const SOURCE_URL = 'https://yunlinaibt.statecraft-baas.com';

// Middleware to serve static files
app.use(express.static(STATIC_DIR));

// Middleware to handle requests for nonexistent static files
app.use(async (req, res, next) => {
  let urlpath = req.path
  if (urlpath == '/') {
    urlpath = '/index.html'
  }
  const filePath = path.join(STATIC_DIR, urlpath);

  // Check if the file exists in the local static directory
  if (!fs.existsSync(filePath)) {
    try {
      // Try to download the file from the source server
      const response = await axios.get(`${SOURCE_URL}${urlpath}`);
      
      // 儲存資源到本地目錄
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, response.data);

      res.set('Content-Type', response.headers['content-type']);
      res.send(response.data);
    } catch (error) {
      // If the file is not found on the source server, send a 404 response
      if (error.response && error.response.status === 404) {
        return res.status(404).send('Not Found');
      }
      // If there is another error, pass it to the next error handler
      return next(error);
    }
  } else {
    // If the file exists, serve it
    res.sendFile(filePath);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
