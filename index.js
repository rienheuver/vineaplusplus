const express = require('express');
const bodyParser = require('body-parser');
const { getData } = require('./helpers');
const exphbs = require('express-handlebars');

const app = express();

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

app.use(express.static('views/'));
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', async (req, res) => {
  res.render('home');
});

app.post('/camps', async (req, res) => {
  const data = await getData(req.body.username, req.body.password);
  // res.json({data});
  res.render('data', {data});
});

app.listen(6363, () => {
  console.log('App listing on port 6363');
});
