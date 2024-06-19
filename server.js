const express = require('express');
const routes = require('./routes/index');

const app = express();
const port = process.env.PORT || 5000;

// Set up the Express to parse JSOn request body
app.use(express.json());

// Load all routes from routes/index.js
app.use('/', routes);

// Start the Express web server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
