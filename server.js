const express = require('express');
const routes = require('./routes/index');

const app = express();
const port = process.env.PORT || 3000;

// Load all routes from routes/index.js
app.use('/', routes);

// Start the Express web server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
