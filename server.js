const express = require('express');
const routes = require('./routes/index');

const app = express();
const port = process.env.PORT || 5000;

// Middleware setup
app.use(express.json());

// Routes setup
app.use('/', routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
