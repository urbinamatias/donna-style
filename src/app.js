const path = require('path');
const express = require('express');
const healthRouter = require('./routes/health');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(healthRouter);

app.get('/', (req, res) => {
  res.render('pages/home', { title: 'Donna Style' });
});

module.exports = app;
